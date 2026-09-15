//! Zpace — desktop shell.
//!
//! The Rust side is deliberately thin: it owns processes and pseudo terminals,
//! talks to git and probes the machine. All product logic lives in the
//! frontend; the commands here are stable, typed entry points.

mod commands;

use commands::process::ProcessState;
use commands::pty::PtyState;
use commands::watch::WatchState;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

/// Bring the main window back from the tray (or from behind everything).
fn reveal(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PtyState::default())
        .manage(ProcessState::default())
        .manage(WatchState::default())
        .manage(commands::updater::PendingUpdate::default())
        .setup(|app| {
            // The name the OS shows (taskbar, Alt+Tab, notifications) — whatever a platform config override left it at.
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_title("Zpace");
                commands::taskbar::set_taskbar_icon(&w);
            }
            // The tray: the Z in the notification area — left click brings the window back (close-to-tray hides
            // it), the menu shows or quits. Built here so the icon is the app's own.
            let show = MenuItem::with_id(app, "show", "Show Zpace", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main").menu(&menu).show_menu_on_left_click(false).tooltip("Zpace");
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "show" => reveal(app),
                "quit" => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                    reveal(tray.app_handle());
                }
            })
            .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::detect_environment,
            commands::git::git_summary,
            commands::git::git_status_files,
            commands::git::git_log,
            commands::git::git_activity,
            commands::git::git_user_name,
            commands::git::git_stage,
            commands::git::git_unstage,
            commands::git::git_discard,
            commands::git::git_commit,
            commands::git::git_push,
            commands::git::git_pull,
            commands::git::git_branches,
            commands::git::git_checkout,
            commands::git::git_delete_branch,
            commands::git::git_fetch,
            commands::git::git_stage_all,
            commands::git::git_clone,
            commands::git::git_diff_file,
            commands::git::git_head,
            commands::git::git_changes,
            commands::git::git_commit_all,
            commands::git::git_merge,
            commands::fs::list_files,
            commands::fs::read_dir,
            commands::fs::read_text_file,
            commands::fs::read_file_head,
            commands::fs::create_file,
            commands::fs::create_dir,
            commands::fs::rename_path,
            commands::fs::trash_path,
            commands::usage::claude_usage,
            commands::fs::write_text_file,
            commands::fs::copy_file,
            commands::fs::path_exists,
            commands::browser::browser_open,
            commands::browser::browser_navigate,
            commands::browser::browser_eval,
            commands::browser::browser_set_bounds,
            commands::browser::browser_set_visible,
            commands::browser::browser_close,
            commands::updater::update_check,
            commands::updater::update_install,
            commands::browser::browser_url,
            commands::browser::browser_zoom,
            commands::browser::open_devtools,
            commands::capture::capture_region,
            commands::media::media_now,
            commands::media::media_control,
            commands::capture::capture_region_to_file,
            commands::capture::clipboard_write_png,
            commands::capture::write_png,
            commands::assets::scan_agent_assets,
            commands::pty::pty_spawn,
            commands::pty::pty_write,
            commands::pty::pty_resize,
            commands::pty::pty_kill,
            commands::process::process_spawn,
            commands::process::process_write,
            commands::process::process_kill,
            commands::search::search_text,
            commands::speech::speech_recognize,
            commands::watch::watch_path,
            commands::watch::unwatch_path,
            commands::git::git_worktrees,
            commands::git::git_worktree_add,
            commands::git::git_worktree_remove,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Zpace");
}
