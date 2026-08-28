import { jsPDF } from "jspdf";
import type { StudyPlan, StudyPlanBlock } from "./domain";
import { formatPlanDate, formatStudyTime } from "./studyPlanner";

const GREEN: [number, number, number] = [18, 105, 88];
const DARK: [number, number, number] = [10, 30, 26];
const MUTED: [number, number, number] = [91, 110, 104];
const LINE: [number, number, number] = [213, 225, 221];
const SOFT: [number, number, number] = [239, 247, 244];

function exportName(plan: StudyPlan, extension: string) {
  const title = plan.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "study-plan";
  return `revit-${plan.date}-${title}.${extension}`;
}

function blockSubject(block: StudyPlanBlock) {
  return [block.subject, block.topic].filter(Boolean).join(" - ") || "-";
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function createStudyPlanPdf(plan: StudyPlan) {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const columns = [margin, margin + 112, margin + 290, margin + 455];
  let y = 0;

  const pageHeader = (continuation = false) => {
    doc.setFillColor(...DARK);
    doc.rect(0, 0, pageWidth, 108, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("RevIT", margin, 42);
    doc.setFontSize(10);
    doc.setTextColor(154, 213, 196);
    doc.text(continuation ? "STUDY PLAN - CONTINUED" : "STUDY PLAN", margin, 62);
    doc.setFontSize(9);
    doc.setTextColor(210, 225, 220);
    doc.text(formatPlanDate(plan.date), margin, 84);
    y = 132;
  };

  const tableHeader = () => {
    doc.setFillColor(...SOFT);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 30, 5, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GREEN);
    doc.text("TIME", columns[0] + 8, y + 19);
    doc.text("ACTIVITY", columns[1] + 8, y + 19);
    doc.text("SUBJECT / TOPIC", columns[2] + 8, y + 19);
    doc.text("TYPE", columns[3] + 8, y + 19);
    y += 38;
  };

  pageHeader();
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text(plan.title, margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${plan.blocks.length} schedule block${plan.blocks.length === 1 ? "" : "s"}`, margin, y + 18);
  y += 38;
  tableHeader();

  if (!plan.blocks.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("No schedule blocks have been added.", margin + 8, y + 20);
  }

  plan.blocks.forEach((block) => {
    const activityLines = doc.splitTextToSize(block.activity, 154) as string[];
    const subjectLines = doc.splitTextToSize(blockSubject(block), 140) as string[];
    const noteLines = block.notes ? doc.splitTextToSize(`Notes: ${block.notes}`, pageWidth - margin * 2 - 16) as string[] : [];
    const bodyLines = Math.max(activityLines.length, subjectLines.length, 1);
    const rowHeight = Math.max(42, 20 + bodyLines * 11 + (noteLines.length ? 8 + noteLines.length * 10 : 0));
    if (y + rowHeight > pageHeight - 48) {
      doc.addPage();
      pageHeader(true);
      tableHeader();
    }
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.7);
    doc.roundedRect(margin, y, pageWidth - margin * 2, rowHeight, 5, 5, "S");
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "bold");
    doc.text(`${formatStudyTime(block.startTime)} -`, columns[0] + 8, y + 17);
    doc.text(formatStudyTime(block.endTime), columns[0] + 8, y + 29);
    doc.text(activityLines, columns[1] + 8, y + 17);
    doc.setFont("helvetica", "normal");
    doc.text(subjectLines, columns[2] + 8, y + 17);
    doc.setTextColor(...GREEN);
    doc.setFont("helvetica", "bold");
    doc.text(block.category.toUpperCase(), columns[3] + 8, y + 17);
    if (block.completed) {
      doc.setFontSize(7);
      doc.text("COMPLETED", columns[3] + 8, y + 29);
    }
    if (noteLines.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(noteLines, margin + 8, y + 17 + bodyLines * 11 + 8);
    }
    y += rowHeight + 7;
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("Generated locally by RevIT. Planner data remains on this device.", margin, pageHeight - 24);
  return doc;
}

export function downloadStudyPlanPdf(plan: StudyPlan) {
  createStudyPlanPdf(plan).save(exportName(plan, "pdf"));
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  });
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

export function downloadStudyPlanImage(plan: StudyPlan, format: "png" | "jpeg") {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not create the study plan image.");
  const width = 1600;
  const rowHeights = plan.blocks.map((block) => block.notes ? 142 : 104);
  const height = Math.max(1000, 380 + rowHeights.reduce((sum, value) => sum + value, 0));
  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#f5f8f7";
  context.fillRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, width, 280);
  gradient.addColorStop(0, "#0a1e1a");
  gradient.addColorStop(1, "#154a40");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, 270);
  context.fillStyle = "#ffffff";
  context.font = "700 62px Arial, sans-serif";
  context.fillText("RevIT", 92, 100);
  context.fillStyle = "#9ad5c4";
  context.font = "700 22px Arial, sans-serif";
  context.fillText("STUDY PLAN", 92, 142);
  context.fillStyle = "#d9e9e4";
  context.font = "400 24px Arial, sans-serif";
  context.fillText(formatPlanDate(plan.date), 92, 202);
  context.fillStyle = "#10251f";
  context.font = "700 42px Arial, sans-serif";
  context.fillText(plan.title, 92, 335);

  const x = [92, 390, 865, 1325];
  let y = 390;
  context.fillStyle = "#dfefea";
  context.fillRect(92, y, width - 184, 54);
  context.fillStyle = "#126958";
  context.font = "700 18px Arial, sans-serif";
  ["TIME", "ACTIVITY", "SUBJECT / TOPIC", "TYPE"].forEach((label, index) => context.fillText(label, x[index] + 18, y + 34));
  y += 68;

  if (!plan.blocks.length) {
    context.fillStyle = "#5b6e68";
    context.font = "400 24px Arial, sans-serif";
    context.fillText("No schedule blocks have been added.", 110, y + 45);
  }

  plan.blocks.forEach((block, index) => {
    const rowHeight = rowHeights[index];
    context.fillStyle = "#ffffff";
    context.fillRect(92, y, width - 184, rowHeight);
    context.strokeStyle = "#d5e1dd";
    context.lineWidth = 2;
    context.strokeRect(92, y, width - 184, rowHeight);
    context.fillStyle = "#10251f";
    context.font = "700 21px Arial, sans-serif";
    context.fillText(formatStudyTime(block.startTime), x[0] + 18, y + 36);
    context.fillText(formatStudyTime(block.endTime), x[0] + 18, y + 66);
    context.font = "700 23px Arial, sans-serif";
    wrapCanvasText(context, block.activity, 420).slice(0, 2).forEach((line, lineIndex) => context.fillText(line, x[1] + 18, y + 38 + lineIndex * 29));
    context.font = "400 21px Arial, sans-serif";
    wrapCanvasText(context, blockSubject(block), 410).slice(0, 2).forEach((line, lineIndex) => context.fillText(line, x[2] + 18, y + 38 + lineIndex * 27));
    context.fillStyle = "#126958";
    context.font = "700 18px Arial, sans-serif";
    context.fillText(block.category.toUpperCase(), x[3] + 18, y + 38);
    if (block.completed) context.fillText("COMPLETED", x[3] + 18, y + 66);
    if (block.notes) {
      context.fillStyle = "#5b6e68";
      context.font = "400 18px Arial, sans-serif";
      wrapCanvasText(context, `Notes: ${block.notes}`, width - 230).slice(0, 2).forEach((line, lineIndex) => context.fillText(line, 110, y + 100 + lineIndex * 22));
    }
    y += rowHeight + 12;
  });

  context.fillStyle = "#5b6e68";
  context.font = "400 17px Arial, sans-serif";
  context.fillText("Generated locally by RevIT", 92, height - 52);
  const extension = format === "jpeg" ? "jpg" : "png";
  downloadDataUrl(canvas.toDataURL(`image/${format}`, 0.94), exportName(plan, extension));
}
