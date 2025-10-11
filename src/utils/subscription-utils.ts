// IProfileItem is declared globally in src/services/types.d.ts

/**
 * 标准化订阅URL，用于去重比较
 */
export const standardizeUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    // 仅移除非鉴权类的常见追踪/临时参数，保留 token 等鉴权参数
    const paramsToRemove = [
      "timestamp",
      "ts",
      "t",
      "_",
      "time",
      "expires",
      "expire",
      "nonce",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "emoji",
      "flag",
    ];
    // 先收集后删除，避免遍历过程中修改迭代器
    const toDelete: string[] = [];
    urlObj.searchParams.forEach((_v, k) => {
      if (paramsToRemove.includes(k.toLowerCase())) {
        toDelete.push(k);
      }
    });
    toDelete.forEach((k) => urlObj.searchParams.delete(k));

    // 规范化查询参数顺序，确保等价 URL 一致
    const entries = Array.from(urlObj.searchParams.entries()).sort(
      (a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]),
    );
    urlObj.search = "";
    for (const [k, v] of entries) {
      urlObj.searchParams.append(k, v);
    }

    // 标准化路径（移除尾部斜杠）
    urlObj.pathname = urlObj.pathname.replace(/\/$/, "");

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
  if (!newUrl || newUrl.trim() === "") {
    return [];
  }

  const standardizedNewUrl = standardizeUrl(newUrl);

  return existingProfiles.filter((profile) => {
    // 排除当前编辑的profile
    if (currentProfileUid && profile.uid === currentProfileUid) {
      return false;
    }

    // 只检查远程订阅
    if (profile.type !== "remote" || !profile.url) {
      return false;
    }

    const standardizedExistingUrl = standardizeUrl(profile.url);

    return standardizedExistingUrl === standardizedNewUrl;
  });
};
