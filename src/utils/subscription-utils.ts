// IProfileItem is declared globally in src/services/types.d.ts

/**
 * 标准化订阅URL，用于去重比较
 */
export const standardizeUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    // 移除常见的追踪参数
    const paramsToRemove = ['timestamp', 'token', 'flag', 'emoji'];
    paramsToRemove.forEach(param => {
      urlObj.searchParams.delete(param);
    });
    
    // 标准化路径（移除尾部斜杠）
    urlObj.pathname = urlObj.pathname.replace(/\/$/, '');
    
    return urlObj.toString();
  } catch {
    // 如果URL格式不正确，返回原URL
    return url.trim();
  }
};

/**
 * 检查订阅是否重复
 */
export const checkDuplicateSubscription = (
  newUrl: string,
  existingProfiles: IProfileItem[],
  currentProfileUid?: string,
): IProfileItem[] => {
  if (!newUrl || newUrl.trim() === '') {
    return [];
  }

  const standardizedNewUrl = standardizeUrl(newUrl);
  
  return existingProfiles.filter((profile) => {
    // 排除当前编辑的profile
    if (currentProfileUid && profile.uid === currentProfileUid) {
      return false;
    }
    
    // 只检查远程订阅
    if (profile.type !== 'remote' || !profile.url) {
      return false;
    }
    
    const standardizedExistingUrl = standardizeUrl(profile.url);
    
    return standardizedExistingUrl === standardizedNewUrl;
  });
};
