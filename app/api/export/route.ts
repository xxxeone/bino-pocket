import { CATEGORIES, PAYMENT_METHODS, PURPOSES, optionLabel } from "@/lib/constants";
import { buildReport, toPerson, type Person } from "@/lib/report";
import { supabaseServer } from "@/lib/supabase/server";
import type { ClaimWithPeople, Trip } from "@/lib/types";
import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type Row = ClaimWithPeople & { reviewer: { id: string; name: string } | null; images: { id: string; drive_url: string | null }[] };

const GREEN = "FF1E6B52";
const HEADER = ["No.", "Items & Description", "Date", "RM", "RMB", "Conversion Rate", "Reviewed", "Reviewed by", "Category", "Purpose", "Payment", "Receipt"];
const WIDTHS = [6, 42, 13, 14, 14, 16, 10, 14, 18, 14, 18, 9];

function sheetName(code: string, name: string) {
  const raw = `${code}_${name}`.replace(/[\[\]:*?/\\]/g, "").trim();
  return raw.slice(0, 31) || "Sheet";
}

function styleHeader(ws: ExcelJS.Worksheet, rowNumber: number, cols: number) {
  const row = ws.getRow(rowNumber);
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    cell.alignment = { vertical: "middle" };
  }
  row.height = 20;
}

function dateFromISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function memberSheet(wb: ExcelJS.Workbook, trip: Trip, person: Person, rows: Row[]) {
  const ws = wb.addWorksheet(sheetName(trip.code, person.name), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = WIDTHS.map((w) => ({ width: w }));
  ws.addRow(HEADER);
  styleHeader(ws, 1, HEADER.length);

  const mine = rows
    .filter((c) => c.user_id === person.id && c.status !== "rejected" && (c.kind === "expense" || c.kind === "transfer"))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at < b.created_at ? -1 : 1));

  let n = 0;
  for (const c of mine) {
    n++;
    const rm = c.amount_myr != null ? Number(c.amount_myr) : null;
    const rmb = c.amount_rmb != null ? Number(c.amount_rmb) : null;
    const rate = c.rate != null ? Number(c.rate) : rm && rmb ? rmb / rm : null;
    const desc = c.kind === "transfer" ? `Transfer to ${c.to_user?.name ?? "teammate"}${c.description && !/^transfer/i.test(c.description) ? ` - ${c.description}` : ""}` : c.description;
    const r = ws.addRow([
      n,
      desc,
      dateFromISO(c.date),
      rm,
      rmb,
      rate ?? "N/A",
      c.status === "approved" ? "/" : "",
      c.reviewer?.name ?? "",
      c.kind === "transfer" ? "Transfer" : optionLabel(CATEGORIES, c.category),
      optionLabel(PURPOSES, c.purpose),
      optionLabel(PAYMENT_METHODS, c.payment_method),
      c.images?.length ?? 0,
    ]);
    r.getCell(3).numFmt = "dd/mm/yyyy";
    r.getCell(4).numFmt = '"RM"#,##0.00';
    r.getCell(5).numFmt = '"¥"#,##0.00';
    if (typeof rate === "number") r.getCell(6).numFmt = "0.000000";
    r.getCell(7).alignment = { horizontal: "center" };
    if (c.status === "approved") r.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAD3" } };
    if (c.is_late) r.getCell(2).font = { color: { argb: "FFB45309" } };
    const link = c.images?.find((i) => i.drive_url)?.drive_url;
    if (link) {
      r.getCell(12).value = { text: `${c.images.length} on Drive`, hyperlink: link };
      r.getCell(12).font = { color: { argb: "FF1F86CC" }, underline: true };
    }
  }

  const totalRm = Math.round(mine.reduce((s, c) => s + (c.amount_myr != null ? Number(c.amount_myr) : 0), 0) * 100) / 100;
  const totalRmb = Math.round(mine.reduce((s, c) => s + (c.amount_rmb != null ? Number(c.amount_rmb) : 0), 0) * 100) / 100;
  const total = ws.addRow(["", "TOTAL", "", totalRm, totalRmb, "", "", ""]);
  total.font = { bold: true };
  total.getCell(2).alignment = { horizontal: "right" };
  total.getCell(4).numFmt = '"RM"#,##0.00';
  total.getCell(5).numFmt = '"¥"#,##0.00';
  for (let c = 1; c <= HEADER.length; c++) total.getCell(c).border = { top: { style: "thin" } };
  return ws;
}

function summarySheet(wb: ExcelJS.Workbook, trip: Trip, rows: Row[], members: Person[]) {
  const report = buildReport(rows, members, trip, { includePending: true });
  const approved = buildReport(rows, members, trip, { includePending: false });
  const ws = wb.addWorksheet("Summary");
  ws.columns = [{ width: 26 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 12 }, { width: 12 }];

  ws.addRow([`${trip.code} — ${trip.name}`]).font = { bold: true, size: 14 };
  ws.addRow([trip.destination ?? "", trip.start_date && trip.end_date ? `${trip.start_date} → ${trip.end_date}` : ""]);
  ws.addRow([]);
  const r1 = ws.addRow(["Total spent (approved)", approved.totals.spent_myr, approved.totals.spent_rmb]);
  const r2 = ws.addRow(["Total spent (incl. pending)", report.totals.spent_myr, report.totals.spent_rmb]);
  const r3 = ws.addRow(["Budget", trip.budget_myr != null ? Number(trip.budget_myr) : "—", report.budget.used_pct != null ? `${report.budget.used_pct}% used` : ""]);
  const r4 = ws.addRow(["Pending approval", report.totals.pending_count, report.totals.pending_myr]);
  for (const r of [r1, r2, r3, r4]) {
    r.getCell(1).font = { bold: true };
    r.getCell(2).numFmt = '"RM"#,##0.00';
  }
  r1.getCell(3).numFmt = '"¥"#,##0.00';
  r2.getCell(3).numFmt = '"¥"#,##0.00';
  r4.getCell(3).numFmt = '"RM"#,##0.00';
  ws.addRow([]);

  const h = ws.addRow(["Name", "Money in (cash + transfers)", "Money out (expenses + transfers)", "Balance", "Items", "Pending"]);
  styleHeader(ws, h.number, 6);
  for (const p of report.people) {
    const r = ws.addRow([
      p.user.name,
      p.cash_in_myr + p.transfers_in_myr,
      p.expenses_myr + p.transfers_out_myr,
      p.balance_myr,
      p.items_count,
      p.pending_count,
    ]);
    for (const c of [2, 3, 4]) r.getCell(c).numFmt = '"RM"#,##0.00';
  }
  ws.addRow([]);

  const h2 = ws.addRow(["Category", "RM", "RMB", "Share", "Items"]);
  styleHeader(ws, h2.number, 5);
  for (const b of report.byCategory) {
    const r = ws.addRow([`${b.emoji} ${b.label}`, b.myr, b.rmb, b.pct / 100, b.count]);
    r.getCell(2).numFmt = '"RM"#,##0.00';
    r.getCell(3).numFmt = '"¥"#,##0.00';
    r.getCell(4).numFmt = "0.0%";
  }
  ws.addRow([]);
  const h3 = ws.addRow(["Purpose", "RM", "RMB", "Share", "Items"]);
  styleHeader(ws, h3.number, 5);
  for (const b of report.byPurpose) {
    const r = ws.addRow([`${b.emoji} ${b.label}`, b.myr, b.rmb, b.pct / 100, b.count]);
    r.getCell(2).numFmt = '"RM"#,##0.00';
    r.getCell(3).numFmt = '"¥"#,##0.00';
    r.getCell(4).numFmt = "0.0%";
  }
  return ws;
}

export async function GET(request: NextRequest) {
  const tripId = request.nextUrl.searchParams.get("trip");
  const onlyMe = request.nextUrl.searchParams.get("me") === "1";
  if (!tripId) return Response.json({ error: "trip required" }, { status: 400 });

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: trip } = await sb.from("fin_trips").select("*").eq("id", tripId).maybeSingle();
  if (!trip) return Response.json({ error: "trip not found" }, { status: 404 });

  const { data: isReviewer } = await sb.rpc("fin_is_reviewer", { t: tripId });
  const mineOnly = onlyMe || !isReviewer;

  const [{ data: members, error: mErr }, { data: claims, error: cErr }, { data: me }] = await Promise.all([
    sb.from("fin_trip_members").select("user_id, profile:fin_profiles(id,name,color)").eq("trip_id", tripId),
    sb
      .from("fin_claims")
      .select(
        "*, user:fin_profiles!fin_claims_user_id_fkey(id,name,color), to_user:fin_profiles!fin_claims_to_user_id_fkey(id,name,color), reviewer:fin_profiles!fin_claims_reviewed_by_fkey(id,name), images:fin_claim_images(id,drive_url)",
      )
      .eq("trip_id", tripId),
    sb.from("fin_profiles").select("id,name,color").eq("id", user.id).maybeSingle(),
  ]);
  if (mErr || cErr) return Response.json({ error: (mErr ?? cErr)?.message }, { status: 500 });

  const rows = (claims ?? []) as unknown as Row[];
  type MemberRow = { user_id: string; profile: { id: string; name: string; color: string } | null };
  let people: Person[] = ((members ?? []) as unknown as MemberRow[]).filter((m) => m.profile).map((m) => toPerson(m.profile!));
  // people who appear on claims but aren't members any more
  for (const c of rows) {
    if (c.user && !people.some((p) => p.id === c.user.id)) people.push(toPerson(c.user));
    if (c.to_user && !people.some((p) => p.id === c.to_user!.id)) people.push(toPerson(c.to_user));
  }
  people.sort((a, b) => a.name.localeCompare(b.name));
  if (mineOnly) {
    const self = me ? toPerson(me) : people.find((p) => p.id === user.id);
    if (!self) return Response.json({ error: "not a member" }, { status: 403 });
    people = [self];
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Bino Pocket";
  wb.created = new Date();
  const t = trip as Trip;
  if (!mineOnly) summarySheet(wb, t, rows, people);
  for (const p of people) memberSheet(wb, t, p, rows);

  const buf = await wb.xlsx.writeBuffer();
  const filename = `${t.code}_PettyCash${mineOnly ? `_${people[0].name.replace(/\s+/g, "")}` : ""}.xlsx`;
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
