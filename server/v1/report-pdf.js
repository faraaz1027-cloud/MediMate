import PDFDocument from "pdfkit";
import {openSync} from "fontkit";
import {fileURLToPath} from "node:url";
const fontPath=fileURLToPath(new URL("../assets/fonts/NotoSansBengali.ttf",import.meta.url));
const font=openSync(fontPath);
export class ReportPDFError extends Error {}
export async function renderVisitPDF(snapshot) {
  const date=value=>new Intl.DateTimeFormat("en-GB",{timeZone:snapshot.displayTimezone,dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
  const sections=[
    ["Scheduled dose history",snapshot.doses.map(x=>`${date(x.dueAtUTC)} | ${x.medicineText} | ${x.state}`)],
    ["Dose action history",snapshot.actions.map(x=>`${date(x.recordedAt)} | ${x.action} | occurrence ${x.occurrenceId}${x.isCorrection?" | correction":""}`)],
    ["Prescription history",snapshot.prescriptions.map(x=>`${date(x.at)} | ${x.title} | version ${x.versionNumber} | ${x.status} | ${x.inclusion==="source_for_selected_doses"?"source for selected doses":"confirmed in range"}`)],
    ["Refills recorded",snapshot.refills.map(x=>`${date(x.recordedAt)} | ${x.medicineText} | ${x.quantity} ${x.unit}`)],
    ["Caregiver task activity",snapshot.caregiverActivity.map(x=>`${date(x.occurredAt)} | ${x.eventType} | ${x.fromStatus||"-"} to ${x.toStatus||"-"} | task ${x.taskId}`)],
    ["Visit and health notes",snapshot.healthNotes.map(x=>`${date(x.recordedAt)} | ${x.text}${x.revision?" | revised":""}`)],
  ];
  const all=[snapshot.patientName,...sections.flatMap(x=>[x[0],...x[1]])].join("\n");
  for(const char of all)if(!/[\n\r\t]/.test(char)&&!font.hasGlyphForCodePoint(char.codePointAt(0)))throw new ReportPDFError("Some report text cannot be rendered by the available English/Bengali font. Review the text before exporting.");
  const doc=new PDFDocument({size:"A4",margins:{top:70,bottom:68,left:48,right:48},bufferPages:true,info:{Title:"MediMate visit report",Author:"MediMate",CreationDate:new Date(snapshot.dataCutoffUTC),ModDate:new Date(snapshot.dataCutoffUTC)}});
  const chunks=[];let size=0;
  const completed=new Promise((resolve,reject)=>{doc.on("data",b=>{size+=b.length;if(size>4*1024*1024){doc.destroy();reject(new ReportPDFError("Report exceeds 4 MiB; choose a shorter range."));}else chunks.push(b);});doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject);});
  doc.font(fontPath);
  const header=()=>{doc.fillColor("#175e63").fontSize(10).text("MEDIMATE  /  VISIT REPORT",48,30,{lineBreak:false});doc.fontSize(9).fillColor("#202d31");doc.x=48;doc.y=70;};
  doc.on("pageAdded",header);header();
  doc.fontSize(21).fillColor("#153d41").text("Medication and care review");doc.moveDown(0.4);
  doc.fontSize(11).fillColor("#202d31").text(snapshot.patientName);
  doc.fontSize(9).text(`Patient ID: ${snapshot.patientId}`);
  doc.text(`Range: ${date(snapshot.fromUTC)} to ${date(snapshot.toUTC)} (end exclusive)`);
  doc.text(`Display timezone: ${snapshot.displayTimezone}`);
  doc.text(`Data cutoff: ${snapshot.dataCutoffUTC} | Metrics: ${snapshot.metricDefinitionVersion}`);doc.moveDown();
  doc.fontSize(12).fillColor("#175e63").text("Saved occurrence counts");
  doc.fontSize(11).fillColor("#202d31").text(`Taken: ${snapshot.taken}    Skipped: ${snapshot.skipped}    Pending: ${snapshot.pending}`);
  doc.text(`Overdue-unconfirmed: ${snapshot.overdueUnconfirmed}    Cancelled (excluded): ${snapshot.cancelled}`);
  doc.moveDown(0.4);doc.fontSize(9).text(`Pending and overdue-unconfirmed are disjoint. Overdue threshold: ${snapshot.delayMinutes} minutes after due time, deferred to a later snooze time. ${snapshot.delaySource}.`);
  doc.text("No recorded events means zero in this dataset, not proof of adherence. Unconfirmed does not mean skipped. This report supports discussion and provides no treatment recommendation.");
  for(const [title,lines] of sections){
    if(doc.y>doc.page.height-135)doc.addPage();doc.moveDown();doc.fontSize(13).fillColor("#175e63").text(title);doc.moveDown(0.25);doc.fontSize(9).fillColor("#202d31");
    if(!lines.length)doc.text("No recorded entries in this range.");
    for(const line of lines){doc.text(line,{width:doc.page.width-96,lineGap:3});doc.moveDown(0.35);}
  }
  const pages=doc.bufferedPageRange();
  if(pages.count>60){doc.destroy();throw new ReportPDFError("Report exceeds 60 pages; choose a shorter range.");}
  for(let i=0;i<pages.count;i++){doc.switchToPage(i);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.fontSize(8).fillColor("#506266").text(`Private report | ${i+1} / ${pages.count}`,48,doc.page.height-34,{lineBreak:false});doc.page.margins.bottom=bottom;}
  doc.end();return completed;
}
