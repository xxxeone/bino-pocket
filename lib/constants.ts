/**
 * Shared option lists. Keep ids stable — they are stored in the database.
 * Labels are English-first with the Chinese name the team actually says.
 */

export interface Option {
  id: string;
  label: string;
  emoji: string;
  /** Platforms that commonly belong to this category (for AI hints + quick picks). */
  platforms?: string[];
}

export const CATEGORIES: Option[] = [
  { id: "transport", label: "Transport 交通", emoji: "🚕", platforms: ["didi", "gaode", "metro", "train", "flight", "taxi", "hellobike"] },
  { id: "food", label: "Food 餐饮", emoji: "🍜", platforms: ["meituan", "dianping", "eleme", "restaurant", "coffee", "luckin"] },
  { id: "snacks", label: "Snacks 零食", emoji: "🍪", platforms: ["mart", "7eleven", "pangdonglai", "supermarket"] },
  { id: "hotel", label: "Hotel 住宿", emoji: "🏨", platforms: ["hotel", "ctrip", "airbnb"] },
  { id: "shopping", label: "Shopping / Gifts 购物", emoji: "🛍️", platforms: ["taobao", "jd", "pinduoduo", "store"] },
  { id: "supplies", label: "Supplies 物资", emoji: "📦", platforms: ["printing", "stationery", "firstaid", "huolala"] },
  { id: "telecom", label: "eSIM / Data 通讯", emoji: "📶", platforms: ["esim", "klook", "sim"] },
  { id: "tickets", label: "Tickets / Activities 门票", emoji: "🎟️", platforms: ["klook", "ctrip", "venue"] },
  { id: "transfer", label: "Transfer to teammate 转账", emoji: "🔁" },
  { id: "cash_in", label: "Petty cash received 收现金", emoji: "💵" },
  { id: "other", label: "Other 其他", emoji: "📝" },
];

export const PLATFORMS: Option[] = [
  { id: "didi", label: "Didi 滴滴", emoji: "🚕" },
  { id: "gaode", label: "Gaode 高德打车", emoji: "🗺️" },
  { id: "meituan", label: "Meituan 美团", emoji: "🟡" },
  { id: "dianping", label: "Dianping 大众点评", emoji: "⭐" },
  { id: "eleme", label: "Ele.me 饿了么", emoji: "🔵" },
  { id: "luckin", label: "Luckin 瑞幸", emoji: "☕" },
  { id: "taobao", label: "Taobao 淘宝", emoji: "🧡" },
  { id: "jd", label: "JD 京东", emoji: "🔴" },
  { id: "pinduoduo", label: "Pinduoduo 拼多多", emoji: "🍊" },
  { id: "ctrip", label: "Ctrip 携程", emoji: "✈️" },
  { id: "train", label: "12306 高铁", emoji: "🚄" },
  { id: "metro", label: "Metro / Bus 地铁公交", emoji: "🚇" },
  { id: "klook", label: "Klook", emoji: "🟠" },
  { id: "huolala", label: "Huolala 货拉拉", emoji: "🚚" },
  { id: "hotel", label: "Hotel 酒店", emoji: "🏨" },
  { id: "restaurant", label: "Restaurant 堂食", emoji: "🍽️" },
  { id: "coffee", label: "Coffee / Tea 咖啡奶茶", emoji: "🧋" },
  { id: "mart", label: "Mart / 7-Eleven 便利店", emoji: "🏪" },
  { id: "pangdonglai", label: "Pangdonglai 胖东来", emoji: "🛒" },
  { id: "store", label: "Physical store 实体店", emoji: "🏬" },
  { id: "other", label: "Other 其他", emoji: "📝" },
];

export const PAYMENT_METHODS: Option[] = [
  { id: "alipay", label: "Alipay 支付宝", emoji: "🅰️" },
  { id: "wechat", label: "WeChat Pay 微信", emoji: "💬" },
  { id: "tng", label: "Touch 'n Go eWallet", emoji: "🔷" },
  { id: "wise", label: "Wise", emoji: "🟢" },
  { id: "card", label: "Credit / Debit card", emoji: "💳" },
  { id: "cash_rmb", label: "Cash RMB 现金人民币", emoji: "💴" },
  { id: "cash_myr", label: "Cash MYR 现金马币", emoji: "💵" },
  { id: "other", label: "Other 其他", emoji: "📝" },
];

export const PURPOSES: Option[] = [
  { id: "team", label: "Team 团队", emoji: "👥" },
  { id: "client", label: "Client 客人", emoji: "🧑‍💼" },
  { id: "company", label: "Company ops 公司运营", emoji: "🏢" },
];

export function optionLabel(list: Option[], id: string | null | undefined) {
  if (!id) return "";
  return list.find((o) => o.id === id)?.label ?? id;
}
export function optionEmoji(list: Option[], id: string | null | undefined, fallback = "📝") {
  if (!id) return fallback;
  return list.find((o) => o.id === id)?.emoji ?? fallback;
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

/** Storage bucket for receipts (Supabase). Path: {trip_id}/{user_id}/{uuid}.jpg */
export const RECEIPTS_BUCKET = "fin-receipts";

/** Avatar colours assigned to new members, in order. */
export const MEMBER_COLORS = [
  "#0E9F8E", "#2563EB", "#D97706", "#DB2777", "#7C3AED", "#059669", "#DC2626", "#0891B2", "#65A30D", "#9333EA",
];
