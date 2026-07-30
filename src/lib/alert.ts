import type { Cyclone } from "./cyclones"

/**
 * Cyclone alerts, written in Khmer first because that is the language of the
 * people who would act on them. English is a subtitle, not the source.
 *
 * Thresholds follow the shape of a national warning ladder: an advisory when a
 * system exists in the basin, a watch when it is closing in, a warning when it
 * is close enough that landfall over Cambodia is a real prospect.
 */

export type AlertLevel = "none" | "advisory" | "watch" | "warning"

export type CycloneAlert = {
  level: AlertLevel
  /** Primary message, Khmer. */
  headlineKm: string
  bodyKm: string
  /** English subtitle. */
  headlineEn: string
  bodyEn: string
  /** Standing guidance, always shown with an active alert. */
  adviceKm: string
  adviceEn: string
}

const WARNING_KM = 800
const WATCH_KM = 1600

/** Khmer digits, so numbers in the Khmer line don't switch script mid-sentence. */
const KHMER_DIGITS = ["០", "១", "២", "៣", "៤", "៥", "៦", "៧", "៨", "៩"]

export function toKhmerNumber(value: number): string {
  return String(Math.round(value))
    .split("")
    .map((c) => KHMER_DIGITS[Number(c)] ?? c)
    .join("")
}

const ADVICE_KM =
  "សូមតាមដានដំណឹងផ្លូវការពីក្រសួងធនធានទឹក និងឧតុនិយម (MOWRAM) និង NCDM។"
const ADVICE_EN =
  "Follow official bulletins from the Ministry of Water Resources and Meteorology (MOWRAM) and NCDM."

export function cycloneAlert(storm: Cyclone | null): CycloneAlert {
  const empty: CycloneAlert = {
    level: "none",
    headlineKm: "",
    bodyKm: "",
    headlineEn: "",
    bodyEn: "",
    adviceKm: ADVICE_KM,
    adviceEn: ADVICE_EN,
  }

  // A past system being replayed must never raise a live alert.
  if (!storm || !storm.isLive) return empty

  const km = Math.round(storm.distanceKm)
  const kmKh = toKhmerNumber(km)
  const wind = storm.currentWindKmh ?? storm.peakWindKmh
  const windKh = wind != null ? toKhmerNumber(wind) : null
  const name = storm.shortName

  const windClauseKm = windKh ? ` ល្បឿនខ្យល់ ${windKh} គ.ម/ម៉ោង។` : ""
  const windClauseEn = wind != null ? ` Winds ${Math.round(wind)} km/h.` : ""

  // "Approaching" is a claim about right now. Once the warning centres stop
  // publishing fixes, the last known heading is history and saying the storm
  // is closing in would be a false alarm — so a stale system caps at advisory.
  if (storm.isStale) {
    const days = Math.round(storm.fixAgeHours / 24)
    const daysKh = toKhmerNumber(days)
    return {
      ...empty,
      level: "advisory",
      headlineKm: `ព័ត៌មានចាស់៖ ${storm.designationKm} ${name} គ្មានទីតាំងថ្មី`,
      bodyKm: `ទីតាំងចុងក្រោយត្រូវបានរាយការណ៍តាំងពី ${daysKh} ថ្ងៃមុន នៅចម្ងាយ ${kmKh} គីឡូម៉ែត្រ។ ព្យុះនេះអាចរលាយបាត់ទៅហើយ។`,
      headlineEn: `Stale: no new position for ${storm.designation} ${name}`,
      bodyEn: `Last reported ${days} day${days === 1 ? "" : "s"} ago at ${km} km. The system may have dissipated.`,
    }
  }

  if (storm.approaching && km <= WARNING_KM) {
    return {
      ...empty,
      level: "warning",
      headlineKm: `ការព្រមានអាសន្ន៖ ${storm.designationKm} ${name} កំពុងឆ្ពោះមកកម្ពុជា`,
      bodyKm: `ព្យុះស្ថិតនៅចម្ងាយ ${kmKh} គីឡូម៉ែត្រ ហើយកំពុងខិតជិតបន្ថែម។ មានលទ្ធភាពឆ្លងកាត់ដែនដីកម្ពុជា។${windClauseKm}`,
      headlineEn: `Warning: ${storm.designation} ${name} is heading toward Cambodia`,
      bodyEn: `${km} km away and still closing. Crossing Cambodian territory is possible.${windClauseEn}`,
    }
  }

  if (storm.approaching && km <= WATCH_KM) {
    return {
      ...empty,
      level: "watch",
      headlineKm: `ការតាមដាន៖ ${storm.designationKm} ${name} កំពុងខិតជិត`,
      bodyKm: `ព្យុះស្ថិតនៅចម្ងាយ ${kmKh} គីឡូម៉ែត្រ ពីកម្ពុជា ហើយកំពុងផ្លាស់ទីចូលមកជិត។${windClauseKm}`,
      headlineEn: `Watch: ${storm.designation} ${name} is approaching`,
      bodyEn: `${km} km from Cambodia and tracking closer.${windClauseEn}`,
    }
  }

  return {
    ...empty,
    level: "advisory",
    headlineKm: `ដំណឹង៖ ${storm.designationKm} ${name} សកម្មក្នុងតំបន់`,
    bodyKm: storm.approaching
      ? `ព្យុះស្ថិតនៅចម្ងាយ ${kmKh} គីឡូម៉ែត្រ។ មិនទាន់ប៉ះពាល់ដល់កម្ពុជានៅឡើយទេ។${windClauseKm}`
      : `ព្យុះស្ថិតនៅចម្ងាយ ${kmKh} គីឡូម៉ែត្រ ហើយកំពុងផ្លាស់ទីចេញឆ្ងាយពីកម្ពុជា។${windClauseKm}`,
    headlineEn: `Advisory: ${storm.designation} ${name} active in the basin`,
    bodyEn: storm.approaching
      ? `${km} km away. No impact on Cambodia yet.${windClauseEn}`
      : `${km} km away and tracking away from Cambodia.${windClauseEn}`,
  }
}
