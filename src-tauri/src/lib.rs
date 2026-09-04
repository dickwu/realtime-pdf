use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Duration, Instant, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

const PDF_WATCH_EVENT: &str = "pdf-file-state";
const HOOK_STATUS_EVENT: &str = "hook-status";
const HISTORY_PATH_EVENT: &str = "history-path-status";
const HOOK_DEBOUNCE_MS: Duration = Duration::from_millis(750);
const HISTORY_SETTLE_DEBOUNCE: Duration = Duration::from_millis(250);

#[derive(Default)]
struct WatchState {
    pdf_session: Mutex<Option<WatchSession>>,
    hook_sessions: Mutex<Vec<HookWatchSession>>,
    history_watchers: Mutex<Vec<HistoryWatchSession>>,
    history_generation: AtomicU64,
    revision: Arc<AtomicU64>,
}

struct WatchSession {
    _watcher: RecommendedWatcher,
}

struct HookWatchSession {
    _watcher: RecommendedWatcher,
}

struct HistoryWatchSession {
    _watcher: RecommendedWatcher,
}

struct HistoryWatchEntry {
    canonical_target: PathBuf,
    file_name: String,
    original_paths: Vec<String>,
}

#[derive(Clone)]
struct ClassifiedPath {
    original: String,
    file_name: String,
    canonical_parent: Option<PathBuf>,
    exists: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfSelection {
    path: String,
    file_name: String,
    revision: u64,
    last_modified_ms: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfWatchEvent {
    path: String,
    file_name: String,
    revision: u64,
    status: &'static str,
    message: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryPathStatus {
    path: String,
    file_name: String,
    exists: bool,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchHook {
    id: String,
    watch_path: String,
    command: String,
    execution_path: String,
    enabled: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HookStatusEvent {
    hook_id: String,
    state: &'static str,
    message: Option<String>,
}

#[tauri::command]
async fn pick_pdf_path(
    app: AppHandle,
    state: State<'_, WatchState>,
) -> Result<Option<PdfSelection>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .blocking_pick_file();

    let Some(file_path) = picked else {
        return Ok(None);
    };

    let path = file_path
        .into_path()
        .map_err(|error| format!("Failed to resolve the selected path: {error}"))?;

    prepare_pdf_path(path)
        .and_then(|resolved_path| start_watcher(&app, &state, resolved_path).map(Some))
}

#[tauri::command]
async fn watch_pdf_path(
    app: AppHandle,
    state: State<'_, WatchState>,
    path: String,
) -> Result<PdfSelection, String> {
    let resolved_path = prepare_pdf_path(parse_input_path(&path)?)?;
    start_watcher(&app, &state, resolved_path)
}

#[tauri::command]
async fn check_history_paths(paths: Vec<String>, require_pdf: bool) -> Vec<HistoryPathStatus> {
    paths
        .into_iter()
        .map(|path| {
            let parsed = parse_input_path(&path).unwrap_or_else(|_| PathBuf::from(path.trim()));
            let exists = if require_pdf {
                parsed.is_file() && is_pdf_path(&parsed)
            } else {
                parsed.exists()
            };

            HistoryPathStatus {
                path,
                file_name: file_name(&parsed),
                exists,
            }
        })
        .collect()
}

#[tauri::command]
async fn set_history_watchers(
    app: AppHandle,
    state: State<'_, WatchState>,
    paths: Vec<String>,
) -> Result<(), String> {
    let gen_id = state.history_generation.fetch_add(1, Ordering::Relaxed) + 1;

    {
        let mut guard = state
            .history_watchers
            .lock()
            .map_err(|_| "Failed to lock history watcher state.".to_string())?;
        guard.clear();
    }

    if paths.is_empty() {
        return Ok(());
    }

    let classified = classify_paths(&paths);
    let initial_statuses: Vec<HistoryPathStatus> = classified
        .iter()
        .map(|c| HistoryPathStatus {
            path: c.original.clone(),
            file_name: c.file_name.clone(),
            exists: c.exists,
        })
        .collect();

    let groups = group_by_canonical_parent(classified);

    let mut sessions = Vec::new();
    for (canonical_parent, entries) in groups {
        let filter: Arc<HashMap<PathBuf, HistoryWatchEntry>> = Arc::new(
            entries
                .into_iter()
                .map(|e| (e.canonical_target.clone(), e))
                .collect(),
        );
        let settle_timers: Arc<Mutex<HashMap<PathBuf, tauri::async_runtime::JoinHandle<()>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let filter_for_cb = Arc::clone(&filter);
        let settle_timers_for_cb = Arc::clone(&settle_timers);
        let app_for_cb = app.clone();

        let mut watcher = match notify::recommended_watcher(move |result: notify::Result<Event>| {
            let event = match result {
                Ok(event) => event,
                Err(error) => {
                    eprintln!("History watcher error: {error}");
                    return;
                }
            };

            if !is_history_event_kind(&event.kind) {
                return;
            }

            let matched: Vec<PathBuf> = event
                .paths
                .iter()
                .filter(|p| filter_for_cb.contains_key(*p))
                .cloned()
                .collect();
            if matched.is_empty() {
                return;
            }

            for canonical_target in matched {
                let mut timers = match settle_timers_for_cb.lock() {
                    Ok(guard) => guard,
                    Err(_) => continue,
                };

                if let Some(prev) = timers.remove(&canonical_target) {
                    prev.abort();
                }

                let filter_for_settle = Arc::clone(&filter_for_cb);
                let timers_for_settle = Arc::clone(&settle_timers_for_cb);
                let app_for_settle = app_for_cb.clone();
                let target_for_settle = canonical_target.clone();

                let handle = tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(HISTORY_SETTLE_DEBOUNCE).await;

                    let entry = match filter_for_settle.get(&target_for_settle) {
                        Some(entry) => entry,
                        None => return,
                    };

                    let exists = target_for_settle.is_file() && is_pdf_path(&target_for_settle);

                    for original in &entry.original_paths {
                        let payload = HistoryPathStatus {
                            path: original.clone(),
                            file_name: entry.file_name.clone(),
                            exists,
                        };
                        let _ = app_for_settle.emit(HISTORY_PATH_EVENT, payload);
                    }

                    if let Ok(mut t) = timers_for_settle.lock() {
                        t.remove(&target_for_settle);
                    }
                });

                timers.insert(canonical_target, handle);
            }
        }) {
            Ok(w) => w,
            Err(error) => {
                eprintln!(
                    "Failed to create history watcher for {}: {error}",
                    canonical_parent.display()
                );
                continue;
            }
        };

        if let Err(error) = watcher.configure(Config::default()) {
            eprintln!(
                "Failed to configure history watcher for {}: {error}",
                canonical_parent.display()
            );
            continue;
        }

        if let Err(error) = watcher.watch(&canonical_parent, RecursiveMode::NonRecursive) {
            eprintln!("Failed to watch {}: {error}", canonical_parent.display());
            continue;
        }

        sessions.push(HistoryWatchSession { _watcher: watcher });
    }

    for status in &initial_statuses {
        let _ = app.emit(HISTORY_PATH_EVENT, status.clone());
    }

    {
        let mut guard = state
            .history_watchers
            .lock()
            .map_err(|_| "Failed to lock history watcher state.".to_string())?;
        let current_gen = state.history_generation.load(Ordering::Relaxed);
        if current_gen == gen_id {
            *guard = sessions;
        } else {
            drop(sessions);
        }
    }

    Ok(())
}

#[tauri::command]
async fn set_active_hooks(
    app: AppHandle,
    state: State<'_, WatchState>,
    hooks: Vec<WatchHook>,
) -> Result<(), String> {
    {
        let mut guard = state
            .hook_sessions
            .lock()
            .map_err(|_| "Failed to lock hook watcher state.".to_string())?;
        guard.clear();
    }

    let mut sessions = Vec::new();

    for hook in hooks {
        if !hook.enabled {
            emit_hook_status(
                &app,
                &hook.id,
                "disabled",
                Some("Hook is disabled.".to_string()),
            );
            continue;
        }

        let watch_target = match resolve_hook_watch_target(&hook.watch_path) {
            Ok(path) => path,
            Err(error) => {
                emit_hook_status(&app, &hook.id, "error", Some(error));
                continue;
            }
        };

        let execution_path = match parse_execution_path(&hook.execution_path) {
            Ok(path) => path,
            Err(error) => {
                emit_hook_status(&app, &hook.id, "error", Some(error));
                continue;
            }
        };

        if hook.command.trim().is_empty() {
            emit_hook_status(
                &app,
                &hook.id,
                "error",
                Some("Hook command cannot be empty.".to_string()),
            );
            continue;
        }

        let hook_id = hook.id.clone();
        let hook_id_for_callback = hook.id.clone();
        let command = hook.command.clone();
        let app_handle = app.clone();
        let filter_target = watch_target.clone();
        let execution_path_for_callback = execution_path.clone();
        let is_running = Arc::new(AtomicBool::new(false));
        let is_running_for_callback = Arc::clone(&is_running);
        let last_trigger = Arc::new(Mutex::new(None::<Instant>));
        let last_trigger_for_callback = Arc::clone(&last_trigger);

        let (watch_scope, watch_mode) = if watch_target.is_dir() {
            (watch_target.clone(), RecursiveMode::Recursive)
        } else {
            (
                watch_target
                    .parent()
                    .map(Path::to_path_buf)
                    .ok_or_else(|| {
                        format!(
                            "Hook watch path {} does not have a parent directory.",
                            watch_target.display()
                        )
                    })?,
                RecursiveMode::NonRecursive,
            )
        };

        let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
            let event = match result {
                Ok(event) => event,
                Err(error) => {
                    emit_hook_status(
                        &app_handle,
                        &hook_id_for_callback,
                        "error",
                        Some(format!("Hook watcher failed: {error}")),
                    );
                    return;
                }
            };

            if !hook_event_targets_path(&event, &filter_target) {
                return;
            }

            if !is_reload_event(&event.kind) {
                return;
            }

            {
                let mut guard = match last_trigger_for_callback.lock() {
                    Ok(guard) => guard,
                    Err(_) => {
                        emit_hook_status(
                            &app_handle,
                            &hook_id_for_callback,
                            "error",
                            Some("Hook debounce state is unavailable.".to_string()),
                        );
                        return;
                    }
                };

                if let Some(last) = *guard
                    && last.elapsed() < HOOK_DEBOUNCE_MS
                {
                    return;
                }

                *guard = Some(Instant::now());
            }

            if is_running_for_callback.swap(true, Ordering::Relaxed) {
                return;
            }

            emit_hook_status(
                &app_handle,
                &hook_id_for_callback,
                "running",
                Some(format!(
                    "Running `{}` in {}",
                    command,
                    execution_path_for_callback.display()
                )),
            );

            let app_for_task = app_handle.clone();
            let hook_id_for_task = hook_id_for_callback.clone();
            let command_for_task = command.clone();
            let execution_path_for_task = execution_path_for_callback.clone();
            let is_running_for_task = Arc::clone(&is_running_for_callback);

            tauri::async_runtime::spawn(async move {
                let outcome = tauri::async_runtime::spawn_blocking(move || {
                    run_hook_command(&command_for_task, &execution_path_for_task)
                })
                .await;

                match outcome {
                    Ok(Ok(message)) => {
                        emit_hook_status(
                            &app_for_task,
                            &hook_id_for_task,
                            "success",
                            Some(message),
                        );
                    }
                    Ok(Err(error)) => {
                        emit_hook_status(&app_for_task, &hook_id_for_task, "error", Some(error));
                    }
                    Err(error) => {
                        emit_hook_status(
                            &app_for_task,
                            &hook_id_for_task,
                            "error",
                            Some(format!("Failed to join hook task: {error}")),
                        );
                    }
                }

                is_running_for_task.store(false, Ordering::Relaxed);
            });
        })
        .map_err(|error| format!("Failed to create hook watcher: {error}"))?;

        watcher
            .configure(Config::default())
            .map_err(|error| format!("Failed to configure hook watcher: {error}"))?;

        watcher
            .watch(&watch_scope, watch_mode)
            .map_err(|error| format!("Failed to watch {}: {error}", watch_scope.display()))?;

        emit_hook_status(
            &app,
            &hook_id,
            "watching",
            Some(format!(
                "Watching {} and executing in {}",
                watch_target.display(),
                execution_path.display()
            )),
        );

        sessions.push(HookWatchSession { _watcher: watcher });
    }

    let mut guard = state
        .hook_sessions
        .lock()
        .map_err(|_| "Failed to lock hook watcher state.".to_string())?;
    *guard = sessions;

    Ok(())
}

fn parse_input_path(raw_path: &str) -> Result<PathBuf, String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err("Enter a PDF path first.".to_string());
    }

    let unquoted = trimmed.trim_matches(|character| character == '"' || character == '\'');
    if unquoted.is_empty() {
        return Err("Enter a valid PDF path.".to_string());
    }

    if let Some(stripped) = unquoted.strip_prefix("~/") {
        let home = env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| "Could not resolve the home directory for this path.".to_string())?;
        return Ok(home.join(stripped));
    }

    Ok(PathBuf::from(unquoted))
}

fn parse_execution_path(raw_path: &str) -> Result<PathBuf, String> {
    let trimmed = raw_path.trim();
    let execution_path = if trimmed.is_empty() || trimmed == "~" {
        env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| "Could not resolve the home directory.".to_string())?
    } else {
        parse_input_path(trimmed)?
    };

    let resolved_path = fs::canonicalize(&execution_path)
        .map_err(|_| format!("Execution path not found at {}.", execution_path.display()))?;

    if !resolved_path.is_dir() {
        return Err(format!(
            "Execution path {} is not a directory.",
            resolved_path.display()
        ));
    }

    Ok(resolved_path)
}

fn prepare_pdf_path(path: PathBuf) -> Result<PathBuf, String> {
    let resolved_path =
        fs::canonicalize(&path).map_err(|_| format!("PDF not found at {}.", path.display()))?;

    if !resolved_path.is_file() {
        return Err(format!("{} is not a file.", resolved_path.display()));
    }

    ensure_pdf(&resolved_path)?;
    Ok(resolved_path)
}

fn resolve_hook_watch_target(raw_path: &str) -> Result<PathBuf, String> {
    let parsed_path = parse_input_path(raw_path)?;
    let resolved_path = fs::canonicalize(&parsed_path)
        .map_err(|_| format!("Hook path not found at {}.", parsed_path.display()))?;

    if !resolved_path.exists() {
        return Err(format!(
            "Hook path does not exist at {}.",
            resolved_path.display()
        ));
    }

    Ok(resolved_path)
}

fn ensure_pdf(path: &Path) -> Result<(), String> {
    if is_pdf_path(path) {
        Ok(())
    } else {
        Err("Please choose a .pdf file.".to_string())
    }
}

fn is_pdf_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false)
}

fn is_history_event_kind(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) | EventKind::Any
    )
}

fn classify_paths(paths: &[String]) -> Vec<ClassifiedPath> {
    paths
        .iter()
        .map(|raw| {
            let resolved = parse_input_path(raw).unwrap_or_else(|_| PathBuf::from(raw.trim()));
            let file_name = file_name(&resolved);
            let canonical_parent = resolved.parent().and_then(|p| fs::canonicalize(p).ok());
            let exists = resolved.is_file() && is_pdf_path(&resolved);
            ClassifiedPath {
                original: raw.clone(),
                file_name,
                canonical_parent,
                exists,
            }
        })
        .collect()
}

fn group_by_canonical_parent(
    entries: Vec<ClassifiedPath>,
) -> HashMap<PathBuf, Vec<HistoryWatchEntry>> {
    let mut groups: HashMap<PathBuf, HashMap<PathBuf, HistoryWatchEntry>> = HashMap::new();
    for entry in entries {
        let Some(parent) = entry.canonical_parent.clone() else {
            continue;
        };
        let canonical_target = parent.join(&entry.file_name);
        let group = groups.entry(parent).or_default();
        let watch_entry =
            group
                .entry(canonical_target.clone())
                .or_insert_with(|| HistoryWatchEntry {
                    canonical_target: canonical_target.clone(),
                    file_name: entry.file_name.clone(),
                    original_paths: Vec::new(),
                });
        watch_entry.original_paths.push(entry.original);
    }
    groups
        .into_iter()
        .map(|(parent, target_map)| (parent, target_map.into_values().collect()))
        .collect()
}

fn start_watcher(
    app: &AppHandle,
    state: &WatchState,
    path: PathBuf,
) -> Result<PdfSelection, String> {
    let watched_dir = path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "The selected PDF does not have a parent directory.".to_string())?;

    let watched_file = path.clone();
    let watched_file_for_callback = watched_file.clone();
    let app_handle = app.clone();
    let revision_counter = Arc::clone(&state.revision);

    let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
        let event = match result {
            Ok(event) => event,
            Err(error) => {
                emit_pdf_event(
                    &app_handle,
                    &watched_file_for_callback,
                    revision_counter.load(Ordering::Relaxed),
                    "error",
                    Some(format!("The file watcher failed: {error}")),
                );
                return;
            }
        };

        if !event_targets_path(&event, &watched_file_for_callback) {
            return;
        }

        if !is_reload_event(&event.kind) {
            return;
        }

        let status = if watched_file_for_callback.exists() {
            "updated"
        } else {
            "removed"
        };

        let revision = revision_counter.fetch_add(1, Ordering::Relaxed) + 1;
        emit_pdf_event(
            &app_handle,
            &watched_file_for_callback,
            revision,
            status,
            None,
        );
    })
    .map_err(|error| format!("Failed to create the file watcher: {error}"))?;

    watcher
        .configure(Config::default())
        .map_err(|error| format!("Failed to configure the file watcher: {error}"))?;

    watcher
        .watch(&watched_dir, RecursiveMode::NonRecursive)
        .map_err(|error| format!("Failed to watch {}: {error}", watched_dir.display()))?;

    let revision = state.revision.fetch_add(1, Ordering::Relaxed) + 1;

    {
        let mut guard = state
            .pdf_session
            .lock()
            .map_err(|_| "Failed to lock the watcher state.".to_string())?;
        *guard = Some(WatchSession { _watcher: watcher });
    }

    emit_pdf_event(app, &watched_file, revision, "ready", None);

    Ok(PdfSelection {
        path: watched_file.to_string_lossy().into_owned(),
        file_name: file_name(&watched_file),
        revision,
        last_modified_ms: last_modified_ms(&watched_file),
    })
}

fn last_modified_ms(path: &Path) -> Option<u64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    let duration = modified.duration_since(UNIX_EPOCH).ok()?;
    u64::try_from(duration.as_millis()).ok()
}

fn event_targets_path(event: &Event, watched_file: &Path) -> bool {
    event.paths.iter().any(|path| path == watched_file)
}

fn is_reload_event(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Any | EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    )
}

fn hook_event_targets_path(event: &Event, filter_target: &Path) -> bool {
    if filter_target.is_dir() {
        event
            .paths
            .iter()
            .any(|path| path.starts_with(filter_target))
    } else {
        event.paths.iter().any(|path| path == filter_target)
    }
}

fn emit_pdf_event(
    app: &AppHandle,
    watched_file: &Path,
    revision: u64,
    status: &'static str,
    message: Option<String>,
) {
    let payload = PdfWatchEvent {
        path: watched_file.to_string_lossy().into_owned(),
        file_name: file_name(watched_file),
        revision,
        status,
        message,
    };

    let _ = app.emit(PDF_WATCH_EVENT, payload);
}

fn emit_hook_status(app: &AppHandle, hook_id: &str, state: &'static str, message: Option<String>) {
    let payload = HookStatusEvent {
        hook_id: hook_id.to_string(),
        state,
        message,
    };

    let _ = app.emit(HOOK_STATUS_EVENT, payload);
}

fn run_hook_command(command: &str, execution_path: &Path) -> Result<String, String> {
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", command])
            .current_dir(execution_path)
            .output()
            .map_err(|error| format!("Failed to run hook command: {error}"))?
    } else {
        Command::new("sh")
            .args(["-lc", command])
            .current_dir(execution_path)
            .output()
            .map_err(|error| format!("Failed to run hook command: {error}"))?
    };

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            Ok("Hook command completed successfully.".to_string())
        } else {
            Ok(stdout)
        }
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };

        if detail.is_empty() {
            Err(format!(
                "Hook command exited with status {}.",
                output.status
            ))
        } else {
            Err(format!(
                "Hook command exited with status {}: {}",
                output.status, detail
            ))
        }
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "selected.pdf".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WatchState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                window.show().unwrap_or_default();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_pdf_path,
            watch_pdf_path,
            check_history_paths,
            set_history_watchers,
            set_active_hooks
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn classify_paths_returns_empty_for_empty_input() {
        let out = classify_paths(&[]);
        assert!(out.is_empty());
    }

    #[test]
    fn classify_paths_resolves_tilde_to_home() {
        let original = "~/.gstack-realtime-pdf-classify-test-does-not-exist.pdf".to_string();
        let out = classify_paths(&[original.clone()]);
        assert_eq!(out.len(), 1);
        let entry = &out[0];
        assert_eq!(entry.original, original);
        // File does not exist but parent ($HOME) usually does, so canonical_parent is Some.
        assert_eq!(
            entry.file_name,
            ".gstack-realtime-pdf-classify-test-does-not-exist.pdf"
        );
        assert!(entry.canonical_parent.is_some());
        assert!(!entry.exists);
    }

    #[test]
    fn classify_paths_marks_existing_pdf_with_parent() {
        let dir = tempdir_in_tmp();
        let target = dir.path().join("present.pdf");
        fs::write(&target, b"%PDF-1.7\n").unwrap();

        let out = classify_paths(&[target.to_string_lossy().into_owned()]);
        assert_eq!(out.len(), 1);
        let entry = &out[0];
        assert!(entry.exists);
        assert!(entry.canonical_parent.is_some());
    }

    #[test]
    fn classify_paths_marks_missing_pdf_when_parent_exists() {
        let dir = tempdir_in_tmp();
        let missing = dir.path().join("absent.pdf");
        assert!(!missing.exists());

        let out = classify_paths(&[missing.to_string_lossy().into_owned()]);
        assert_eq!(out.len(), 1);
        let entry = &out[0];
        assert!(!entry.exists);
        assert!(entry.canonical_parent.is_some());
    }

    #[test]
    fn classify_paths_marks_missing_parent_as_none() {
        let parent =
            PathBuf::from("/var/empty/realtime-pdf-no-such-dir-12345/sub-vanished/another");
        let target = parent.join("foo.pdf");
        let out = classify_paths(&[target.to_string_lossy().into_owned()]);
        assert_eq!(out.len(), 1);
        assert!(out[0].canonical_parent.is_none());
        assert!(!out[0].exists);
    }

    #[test]
    fn group_by_canonical_parent_collapses_same_parent_into_one_group() {
        let dir = tempdir_in_tmp();
        let a = dir.path().join("a.pdf");
        let b = dir.path().join("b.pdf");
        let classified = classify_paths(&[
            a.to_string_lossy().into_owned(),
            b.to_string_lossy().into_owned(),
        ]);

        let groups = group_by_canonical_parent(classified);
        assert_eq!(groups.len(), 1);
        let (parent, entries) = groups.into_iter().next().unwrap();
        assert_eq!(parent, fs::canonicalize(dir.path()).unwrap());
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn group_by_canonical_parent_separates_distinct_parents() {
        let dir_a = tempdir_in_tmp();
        let dir_b = tempdir_in_tmp();
        let pa = dir_a.path().join("a.pdf");
        let pb = dir_b.path().join("b.pdf");
        let classified = classify_paths(&[
            pa.to_string_lossy().into_owned(),
            pb.to_string_lossy().into_owned(),
        ]);

        let groups = group_by_canonical_parent(classified);
        assert_eq!(groups.len(), 2);
    }

    #[test]
    fn group_by_canonical_parent_fans_out_duplicate_canonicals() {
        // /tmp -> /private/tmp on macOS, so a path via /tmp/... and the
        // canonical /private/tmp/... resolve to the same canonical_target.
        let dir = tempfile::tempdir_in("/tmp").unwrap();
        let raw_target = dir.path().join("dup.pdf");
        let canonical_parent = fs::canonicalize(dir.path()).unwrap();
        let canonical_target = canonical_parent.join("dup.pdf");
        // On macOS, dir.path() lives under /tmp/* but canonicalizes to /private/tmp/*.
        // Skip the assertion if the runtime doesn't symlink /tmp.
        if raw_target == canonical_target {
            eprintln!("Skipping: /tmp is not symlinked on this platform");
            return;
        }

        let inputs = vec![
            raw_target.to_string_lossy().into_owned(),
            canonical_target.to_string_lossy().into_owned(),
        ];

        let classified = classify_paths(&inputs);
        let groups = group_by_canonical_parent(classified);
        assert_eq!(groups.len(), 1, "both paths share one canonical parent");
        let entries = groups.into_values().next().unwrap();
        assert_eq!(
            entries.len(),
            1,
            "both paths collapse to one canonical_target entry"
        );
        let entry = &entries[0];
        assert_eq!(entry.original_paths.len(), 2, "both originals are tracked");
        assert!(entry.original_paths.contains(&inputs[0]));
        assert!(entry.original_paths.contains(&inputs[1]));
    }

    #[test]
    fn is_history_event_kind_accepts_relevant_kinds() {
        use notify::event::{CreateKind, ModifyKind, RemoveKind};
        assert!(is_history_event_kind(&EventKind::Create(CreateKind::File)));
        assert!(is_history_event_kind(&EventKind::Modify(ModifyKind::Any)));
        assert!(is_history_event_kind(&EventKind::Remove(RemoveKind::File)));
        assert!(is_history_event_kind(&EventKind::Any));
    }

    #[test]
    fn is_history_event_kind_rejects_access_and_other() {
        use notify::event::AccessKind;
        assert!(!is_history_event_kind(&EventKind::Access(AccessKind::Any)));
        assert!(!is_history_event_kind(&EventKind::Other));
    }

    fn tempdir_in_tmp() -> tempfile::TempDir {
        tempfile::tempdir_in("/tmp").unwrap_or_else(|_| tempdir().unwrap())
    }
}
