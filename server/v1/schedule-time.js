import { Temporal } from "@js-temporal/polyfill";

export const MAX_DAYS = 90,
  MAX_EVENTS = 2000;
// Start inclusive, end exclusive. No parsing of prescription prose or strength.
export function generateOccurrences(input) {
  const start = Temporal.Instant.from(input.effectiveFromUTC),
    end = Temporal.Instant.from(input.endAtUTC),
    result = [];
  const add = (instant) => {
    if (
      Temporal.Instant.compare(instant, start) >= 0 &&
      Temporal.Instant.compare(instant, end) < 0
    ) {
      result.push(instant.toString({ smallestUnit: "millisecond" }));
      if (result.length > MAX_EVENTS)
        throw new RangeError(`Limit the course to ${MAX_EVENTS} events.`);
    }
  };
  if (input.timingMode === "interval") {
    const anchor = Temporal.Instant.from(input.anchorAtUTC).epochMilliseconds,
      step = input.intervalMinutes * 60000;
    let tick =
      anchor +
      Math.max(0, Math.ceil((start.epochMilliseconds - anchor) / step)) * step;
    for (; tick < end.epochMilliseconds; tick += step)
      add(Temporal.Instant.fromEpochMilliseconds(tick));
  } else {
    let day = start.toZonedDateTimeISO(input.timezone).toPlainDate();
    const last = end.toZonedDateTimeISO(input.timezone).toPlainDate();
    for (
      ;
      Temporal.PlainDate.compare(day, last) <= 0;
      day = day.add({ days: 1 })
    ) {
      for (const time of input.localTimes) {
        const local = day.toPlainDateTime(Temporal.PlainTime.from(time));
        // Ignore candidates outside UTC bounds even if their wall time is ambiguous.
        const early = local
            .toZonedDateTime(input.timezone, { disambiguation: "earlier" })
            .toInstant(),
          late = local
            .toZonedDateTime(input.timezone, { disambiguation: "later" })
            .toInstant();
        if (
          Temporal.Instant.compare(late, start) < 0 ||
          Temporal.Instant.compare(early, end) >= 0
        )
          continue;
        try {
          add(
            local
              .toZonedDateTime(input.timezone, { disambiguation: "reject" })
              .toInstant(),
          );
        } catch (e) {
          throw new RangeError(
            `${day} ${time} in ${input.timezone}: ${e.message}`,
          );
        }
      }
    }
  }
  return result.sort();
}

export function normalizeSchedule(b, invalid, now) {
  const instant = (value, path) => {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d\d-\d\dT([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?Z$/.test(
        value,
      )
    )
      invalid(path, "Enter an explicit UTC timestamp ending in Z.");
    try {
      return Temporal.Instant.from(value).toString({
        smallestUnit: "millisecond",
      });
    } catch {
      invalid(path, "Enter a valid UTC timestamp.");
    }
  };
  const effectiveFromUTC = instant(b.effectiveFromUTC, "effectiveFromUTC"),
    endAtUTC = instant(b.endAtUTC, "endAtUTC");
  const start = Date.parse(effectiveFromUTC),
    end = Date.parse(endAtUTC);
  if (start < now.getTime())
    invalid(
      "effectiveFromUTC",
      "Choose a future start; past events cannot be rewritten.",
    );
  if (end <= start || end - start > MAX_DAYS * 86400000)
    invalid(
      "endAtUTC",
      `Choose an exclusive end after start, within ${MAX_DAYS} elapsed days.`,
    );
  if (typeof b.timezone !== "string" || /^[+-]/.test(b.timezone))
    invalid("timezone", "Use a named IANA timezone.");
  try {
    Temporal.Instant.from(effectiveFromUTC).toZonedDateTimeISO(b.timezone);
  } catch {
    invalid("timezone", "Use a valid IANA timezone, for example Asia/Dhaka.");
  }
  if (
    typeof b.doseQuantity !== "string" ||
    !/^\d{1,12}(\.\d{1,6})?$/.test(b.doseQuantity) ||
    Number(b.doseQuantity) <= 0
  )
    invalid(
      "doseQuantity",
      "Use the positive decimal quantity from the confirmed instruction.",
    );
  if (b.reviewedAgainstSource !== true)
    invalid(
      "reviewedAgainstSource",
      "Review timing, quantity, medicine and duration against the confirmed source.",
    );
  const out = {
    effectiveFromUTC,
    endAtUTC,
    timezone: b.timezone,
    timingMode: b.timingMode,
    doseQuantity: b.doseQuantity,
    doseUnit: b.doseUnit,
  };
  if (b.timingMode === "fixed_times") {
    if (b.intervalMinutes !== undefined || b.anchorAtUTC !== undefined)
      invalid("timingMode", "Fixed times cannot include interval fields.");
    if (
      !Array.isArray(b.localTimes) ||
      !b.localTimes.length ||
      b.localTimes.length > 24 ||
      b.localTimes.some(
        (x) => typeof x !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x),
      ) ||
      new Set(b.localTimes).size !== b.localTimes.length
    )
      invalid("localTimes", "Enter 1–24 unique HH:mm times.");
    out.localTimes = [...b.localTimes].sort();
  } else if (b.timingMode === "interval") {
    if (b.localTimes !== undefined)
      invalid("timingMode", "An interval cannot include fixed local times.");
    if (
      !Number.isSafeInteger(b.intervalMinutes) ||
      b.intervalMinutes < 1 ||
      b.intervalMinutes > MAX_DAYS * 1440
    )
      invalid(
        "intervalMinutes",
        "Enter a positive whole number of minutes within 90 days.",
      );
    out.intervalMinutes = b.intervalMinutes;
    out.anchorAtUTC = instant(b.anchorAtUTC, "anchorAtUTC");
    if (Date.parse(out.anchorAtUTC) > start)
      invalid(
        "anchorAtUTC",
        "Anchor must be at or before the effective start.",
      );
  } else invalid("timingMode", "Choose fixed_times or interval.");
  let events;
  try {
    events = generateOccurrences(out);
  } catch (e) {
    invalid(
      b.timingMode === "interval" ? "intervalMinutes" : "localTimes",
      `Course cannot be generated: ambiguous/nonexistent local time or event limit. ${e.message}`,
    );
  }
  if (!events.length)
    invalid(
      "endAtUTC",
      "No dose falls in this course. Review the time and boundaries.",
    );
  return { input: out, events };
}
