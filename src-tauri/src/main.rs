#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 在 Windows 上分配控制台用于诊断启动问题
    #[cfg(all(windows, not(debug_assertions)))]
    {
        unsafe {
            use std::ffi::CString;
            use winapi::um::consoleapi::AllocConsole;
            use winapi::um::wincon::SetConsoleTitleA;

            // 分配控制台
            AllocConsole();

            // 设置控制台标题
            if let Ok(title) = CString::new("Liebesu_Clash 诊断控制台") {
                SetConsoleTitleA(title.as_ptr());
            }
        }
    }

    #[cfg(feature = "tokio-trace")]
    console_subscriber::init();

    println!("🔧 Liebesu_Clash 启动诊断模式");
    println!("如果应用正常启动，此控制台窗口将自动关闭");
    println!("如果出现错误，请截图此窗口内容以便诊断");
    println!("========================================");

    // 捕获 panic 并显示在控制台
    std::panic::set_hook(Box::new(|panic_info| {
        eprintln!("❌ 应用程序发生致命错误:");
        eprintln!("{}", panic_info);

        #[cfg(windows)]
        {
            use std::ffi::CString;
            unsafe extern "system" {
                fn MessageBoxA(
                    hwnd: *mut std::ffi::c_void,
                    text: *const i8,
                    caption: *const i8,
                    utype: u32,
                ) -> i32;
            }

            let error_msg = format!(
                "Liebesu_Clash 发生致命错误\n\n{}\n\n请查看控制台窗口获取详细信息",
                panic_info
            );
            if let (Ok(msg), Ok(title)) = (CString::new(error_msg), CString::new("致命错误")) {
                unsafe {
                    MessageBoxA(
                        std::ptr::null_mut(),
                        msg.as_ptr(),
                        title.as_ptr(),
                        0x10 | 0x0,
                    );
                }
            }
        }

        // 保持控制台窗口打开
        println!("\n按 Enter 键退出...");
        let mut input = String::new();
        std::io::stdin().read_line(&mut input).ok();
        std::process::exit(1);
    }));

    // 运行应用
    let result = std::panic::catch_unwind(|| {
        app_lib::run();
    });

    match result {
        Ok(_) => {
            println!("✅ 应用程序正常退出");
        }
        Err(e) => {
            eprintln!("❌ 应用程序异常退出: {:?}", e);

            // 保持控制台窗口打开以便查看错误
            println!("\n按 Enter 键退出...");
            let mut input = String::new();
            std::io::stdin().read_line(&mut input).ok();
            std::process::exit(1);
        }
    }
}
