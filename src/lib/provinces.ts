import type { Station } from "./storm"

/**
 * Every first-level division of Cambodia: the 24 provinces (ខេត្ត) plus the
 * capital, Phnom Penh, which is an autonomous municipality rather than a
 * province. Coordinates are each division's administrative seat, because that
 * is where the population — and the forecast that matters — sits.
 */
export const PROVINCES: Station[] = [
  { id: "bmc", nameEn: "Banteay Meanchey", nameKm: "បន្ទាយមានជ័យ", coordinates: [102.9737, 13.5859], kind: "city" },
  { id: "btb", nameEn: "Battambang", nameKm: "បាត់ដំបង", coordinates: [103.2022, 13.0957], kind: "city" },
  { id: "kpc", nameEn: "Kampong Cham", nameKm: "កំពង់ចាម", coordinates: [105.4547, 11.9934], kind: "city" },
  { id: "kch", nameEn: "Kampong Chhnang", nameKm: "កំពង់ឆ្នាំង", coordinates: [104.6669, 12.25], kind: "city" },
  { id: "kps", nameEn: "Kampong Speu", nameKm: "កំពង់ស្ពឺ", coordinates: [104.5209, 11.453], kind: "city" },
  { id: "kpt", nameEn: "Kampong Thom", nameKm: "កំពង់ធំ", coordinates: [104.8885, 12.7111], kind: "city" },
  { id: "kam", nameEn: "Kampot", nameKm: "កំពត", coordinates: [104.181, 10.6104], kind: "city" },
  { id: "knd", nameEn: "Kandal", nameKm: "កណ្ដាល", coordinates: [104.9481, 11.4842], kind: "city" },
  { id: "kep", nameEn: "Kep", nameKm: "កែប", coordinates: [104.3167, 10.4833], kind: "city" },
  { id: "kkg", nameEn: "Koh Kong", nameKm: "កោះកុង", coordinates: [103.0, 11.6153], kind: "city" },
  { id: "kra", nameEn: "Kratie", nameKm: "ក្រចេះ", coordinates: [106.0187, 12.4881], kind: "city" },
  { id: "mdk", nameEn: "Mondulkiri", nameKm: "មណ្ឌលគិរី", coordinates: [107.1883, 12.45], kind: "city" },
  { id: "omc", nameEn: "Oddar Meanchey", nameKm: "ឧត្ដរមានជ័យ", coordinates: [103.5167, 14.1833], kind: "city" },
  { id: "pln", nameEn: "Pailin", nameKm: "ប៉ៃលិន", coordinates: [102.6093, 12.8489], kind: "city" },
  { id: "pp", nameEn: "Phnom Penh", nameKm: "ភ្នំពេញ", coordinates: [104.921, 11.562], kind: "city" },
  { id: "psh", nameEn: "Preah Sihanouk", nameKm: "ព្រះសីហនុ", coordinates: [103.5, 10.627], kind: "city" },
  { id: "pvh", nameEn: "Preah Vihear", nameKm: "ព្រះវិហារ", coordinates: [104.9808, 13.8079], kind: "city" },
  { id: "pvg", nameEn: "Prey Veng", nameKm: "ព្រៃវែង", coordinates: [105.325, 11.4869], kind: "city" },
  { id: "pst", nameEn: "Pursat", nameKm: "ពោធិ៍សាត់", coordinates: [103.9192, 12.5388], kind: "city" },
  { id: "rtk", nameEn: "Ratanakiri", nameKm: "រតនគិរី", coordinates: [107.0028, 13.7394], kind: "city" },
  { id: "srp", nameEn: "Siem Reap", nameKm: "សៀមរាប", coordinates: [103.8555, 13.3622], kind: "city" },
  { id: "stg", nameEn: "Stung Treng", nameKm: "ស្ទឹងត្រែង", coordinates: [105.9699, 13.5259], kind: "city" },
  { id: "svr", nameEn: "Svay Rieng", nameKm: "ស្វាយរៀង", coordinates: [105.7993, 11.0878], kind: "city" },
  { id: "tak", nameEn: "Takeo", nameKm: "តាកែវ", coordinates: [104.785, 10.9908], kind: "city" },
  { id: "tbk", nameEn: "Tbong Khmum", nameKm: "ត្បូងឃ្មុំ", coordinates: [105.9683, 11.9142], kind: "city" },
]
