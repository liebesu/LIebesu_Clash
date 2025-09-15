/**
 * 订阅工具函数
 */

/**
 * 标准化 URL，用于比较
 * 移除末尾斜杠、协议差异、查询参数排序等
 */
export const normalizeUrl = (url: string): string => {
  if (!url) return "";
  
  try {
    const urlObj = new URL(url.trim());
    
    // 移除末尾斜杠
    const pathname = urlObj.pathname.replace(/\/$/, "");
    
    // 排序查询参数以便比较
    const searchParams = Array.from(urlObj.searchParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    
    // 重建标准化的 URL
    return `${urlObj.protocol}//${urlObj.host}${pathname}${searchParams ? `?${searchParams}` : ""}`;
  } catch (error) {
    // 如果不是有效的 URL，返回原始字符串的标准化版本
    return url.trim().toLowerCase();
  }
};

/**
 * 检查 URL 是否重复
 * @param newUrl 新的订阅 URL
 * @param existingProfiles 现有的订阅列表
 * @param excludeUid 要排除的订阅 UID（用于编辑时排除自身）
 * @returns 重复的订阅列表
 */
export const checkDuplicateSubscription = (
  newUrl: string,
  existingProfiles: IProfileItem[],
  excludeUid?: string
): IProfileItem[] => {
  if (!newUrl || !newUrl.trim()) {
    return [];
  }

  const normalizedNewUrl = normalizeUrl(newUrl);
  
  return existingProfiles.filter((profile) => {
    // 排除指定的 UID（编辑时不检查自身）
    if (excludeUid && profile.uid === excludeUid) {
      return false;
    }
    
    // 只检查有 URL 的订阅（远程订阅）
    if (!profile.url) {
      return false;
    }
    
    const normalizedExistingUrl = normalizeUrl(profile.url);
    return normalizedExistingUrl === normalizedNewUrl;
  });
};

/**
 * 检查订阅名称是否重复
 * @param newName 新的订阅名称
 * @param existingProfiles 现有的订阅列表
 * @param excludeUid 要排除的订阅 UID
 * @returns 是否重复
 */
export const checkDuplicateName = (
  newName: string,
  existingProfiles: IProfileItem[],
  excludeUid?: string
): boolean => {
  if (!newName || !newName.trim()) {
    return false;
  }

  const normalizedNewName = newName.trim().toLowerCase();
  
  return existingProfiles.some((profile) => {
    // 排除指定的 UID
    if (excludeUid && profile.uid === excludeUid) {
      return false;
    }
    
    if (!profile.name) {
      return false;
    }
    
    const normalizedExistingName = profile.name.trim().toLowerCase();
    return normalizedExistingName === normalizedNewName;
  });
};

/**
 * 获取建议的订阅名称（避免重复）
 * @param baseName 基础名称
 * @param existingProfiles 现有订阅列表
 * @param excludeUid 要排除的订阅 UID
 * @returns 建议的唯一名称
 */
export const getSuggestedName = (
  baseName: string,
  existingProfiles: IProfileItem[],
  excludeUid?: string
): string => {
  if (!baseName) return "";
  
  let suggestedName = baseName.trim();
  let counter = 1;
  
  while (checkDuplicateName(suggestedName, existingProfiles, excludeUid)) {
    counter++;
    suggestedName = `${baseName.trim()} (${counter})`;
  }
  
  return suggestedName;
};
