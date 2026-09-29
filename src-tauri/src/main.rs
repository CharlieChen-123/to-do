// 隐藏 release 模式的控制台窗口；debug 模式保留便于排查
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    include_image,
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime, Window, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// 显示 / 隐藏主窗口（托盘点击、全局快捷键共用）
fn toggle_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let visible = w.is_visible().unwrap_or(false);
        let minimized = w.is_minimized().unwrap_or(false);
        if visible && !minimized {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }
}

fn focus_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        // 只开一个实例：再双击 exe 时把已有窗口拉到前台
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_window(app);
        }))
        // 记住窗口位置和大小
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // 开机自启：带 --startup 参数启动，用于静默进托盘
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--startup"]),
        ))
        // 全局快捷键 Ctrl+Alt+J
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let shortcut =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyJ);
            app.global_shortcut().register(shortcut)?;

            // 首次运行即开启开机自启（可在托盘菜单或系统「启动」里关掉）
            let _ = app.autolaunch().enable();

            let show_i = MenuItemBuilder::with_id("show", "打开 Jot").build(app)?;
            let hide_i = MenuItemBuilder::with_id("hide", "隐藏到托盘").build(app)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItemBuilder::with_id("quit", "退出 Jot").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show_i, &hide_i, &sep, &quit_i])
                .build()?;

            TrayIconBuilder::with_id("main")
                .menu(&menu)
                .icon(include_image!("icons/tray.png"))
                .tooltip("Jot")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => focus_window(app),
                    "hide" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // 开机自启场景：静默进托盘，不弹窗口
            if std::env::args().any(|a| a == "--startup") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }

            Ok(())
        })
        // 点窗口右上角 X：只隐藏到托盘，不退出进程
        .on_window_event(|window: &Window, event: &WindowEvent| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("启动 Jot 失败");
}
