import axios, { AxiosInstance } from "axios";
import { getClashInfo, getIpInfo as getIpInfoFromBackend } from "./cmds";

let instancePromise: Promise<AxiosInstance> = null!;

async function getInstancePromise() {
  let server = "";
  let secret = "";

  try {
    const info = await getClashInfo();

    if (info?.server) {
      server = info.server;

      // compatible width `external-controller`
      if (server.startsWith(":")) server = `127.0.0.1${server}`;
      else if (/^\d+$/.test(server)) server = `127.0.0.1:${server}`;
    }
    if (info?.secret) secret = info?.secret;
  } catch {}

  const axiosIns = axios.create({
    baseURL: `http://${server}`,
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
    timeout: 15000,
  });
  axiosIns.interceptors.response.use((r) => r.data);
  return axiosIns;
}

/// initialize some information
/// enable force update axiosIns
export const getAxios = async (force: boolean = false) => {
  if (!instancePromise || force) {
    instancePromise = getInstancePromise();
  }
  return instancePromise;
};

interface IpInfo {
  ip: string;
  country_code: string;
  country: string;
  region: string;
  city: string;
  organization: string;
  asn: number;
  asn_organization: string;
  longitude: number;
  latitude: number;
  timezone: string;
}

// 使用后端API获取IP信息，避免CORS问题
export async function getCurrentIpInfo() {
  try {
    const data = await getIpInfoFromBackend();
    return normalizeBackendIpInfo(data);
  } catch (error) {
    console.warn("[getCurrentIpInfo] 获取IP信息失败:", error);
    return getUnknownIpInfo();
  }
}

function normalizeBackendIpInfo(data: any): IpInfo {
  if (!data || typeof data !== "object") {
    return getUnknownIpInfo();
  }

  const asnValue = data.asn || data.as_number || data?.connection?.asn;
  const orgValue =
    data.organization ||
    data.org ||
    data.asn_organization ||
    data.asn_org ||
    data?.connection?.org ||
    data?.connection?.isp;

  const countryCode =
    data.country_code ||
    data.countryCode ||
    data.country_code2 ||
    data.country_code_iso3 ||
    data?.country?.code ||
    "";

  const longitude =
    data.longitude ||
    data.lon ||
    data?.location?.longitude ||
    data?.loc?.split?.(",")?.[0] ||
    0;

  const latitude =
    data.latitude ||
    data.lat ||
    data?.location?.latitude ||
    data?.loc?.split?.(",")?.[1] ||
    0;

  // 统一将时区字段规范为字符串，避免 React 渲染到对象导致崩溃（Minified React error #31）
  const timezone = (() => {
    const tz = (data as any)?.timezone;
    if (typeof tz === "string") return tz;
    if (tz && typeof tz === "object") {
      return (
        tz.id || tz.name || tz.abbr || tz.abbreviation || tz.label || ""
      );
    }
    return (
      (data as any)?.time_zone ||
      (data as any)?.timezone?.id ||
      (data as any)?.location?.time_zone ||
      ""
    );
  })();

  return {
    ip: data.ip || data.query || "unknown",
    country_code: (countryCode || "").toUpperCase(),
    country:
      data.country ||
      data.country_name ||
      data.countryRegion ||
      data?.location?.country ||
      data?.country?.name ||
      "",
    region:
      data.region ||
      data.regionName ||
      data.state_prov ||
      data?.location?.region ||
      data?.location?.state ||
      "",
    city:
      data.city ||
      data.district ||
      data?.location?.city ||
      data?.city_name ||
      "",
    organization: orgValue || "",
    asn: typeof asnValue === "number" ? asnValue : parseInt(asnValue, 10) || 0,
    asn_organization: orgValue || "",
    longitude: Number(longitude) || 0,
    latitude: Number(latitude) || 0,
    timezone,
  };
}

function getUnknownIpInfo(): IpInfo {
  return {
    ip: "unknown",
    country_code: "",
    country: "",
    region: "",
    city: "",
    organization: "",
    asn: 0,
    asn_organization: "",
    longitude: 0,
    latitude: 0,
    timezone: "",
  };
}

// 获取当前IP和地理位置信息
export const getIpInfo = async (): Promise<IpInfo> => {
  try {
    return await getCurrentIpInfo();
  } catch (error: any) {
    console.log("[getIpInfo] 后端IP信息获取失败，返回默认值", error?.message);
    return getUnknownIpInfo();
  }
};
