export type DayCell = {
  day: number;
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
};

export function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function toDateStr(year: number, month: number, day: number) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

export function parseDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`);
}

export function getCalendarCells(currentDate: Date) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const today = new Date();
  const todayStr = toDateStr(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const cells: DayCell[] = [];

  for (let i = firstDay - 1; i >= 0; i -= 1) {
    const day = daysInPrevMonth - i;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const dateStr = toDateStr(prevYear, prevMonth, day);
    const dow = new Date(prevYear, prevMonth, day).getDay();
    cells.push({
      day,
      dateStr,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      isWeekend: dow === 0 || dow === 6,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = toDateStr(year, month, day);
    const dow = new Date(year, month, day).getDay();
    cells.push({
      day,
      dateStr,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      isWeekend: dow === 0 || dow === 6,
    });
  }

  const remaining = 42 - cells.length;
  for (let day = 1; day <= remaining; day += 1) {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const dateStr = toDateStr(nextYear, nextMonth, day);
    const dow = new Date(nextYear, nextMonth, day).getDay();
    cells.push({
      day,
      dateStr,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      isWeekend: dow === 0 || dow === 6,
    });
  }

  return cells;
}

export function getGridDateRange(currentDate: Date) {
  const cells = getCalendarCells(currentDate);
  const start = parseDate(cells[0].dateStr);
  const end = parseDate(cells[cells.length - 1].dateStr);
  return { start, end, startStr: cells[0].dateStr, endStr: cells[cells.length - 1].dateStr };
}

export function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export function formatDateRange(start: string, end?: string | null) {
  if (!end || end === start) {
    return formatDate(start);
  }

  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);

  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth();

  const startText = startDate.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const endText = endDate.toLocaleDateString("ko-KR", {
    year: sameYear ? undefined : "numeric",
    month: sameMonth ? undefined : "long",
    day: "numeric",
    weekday: "long",
  });

  return `${startText} ~ ${endText}`;
}
