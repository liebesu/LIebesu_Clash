// 通用工具函数
export function log_success(message, ...args) {
  console.log(`✅ ${message}`, ...args);
}

export function log_error(message, ...args) {
  console.error(`❌ ${message}`, ...args);
}

export function log_info(message, ...args) {
  console.log(`ℹ️ ${message}`, ...args);
}

export function log_warning(message, ...args) {
  console.warn(`⚠️ ${message}`, ...args);
}