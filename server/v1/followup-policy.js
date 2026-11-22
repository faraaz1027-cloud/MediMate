export async function followupCaregiverAllowed(db,patientId,userId,s) {
  const grant=await db.one("AccessGrant",{patientId,userId,revokedAt:null},s);
  return !!grant && ["dose.read","dose.record","task.read","task.write"].every(p=>grant.permissions.includes(p));
}
export async function followupNoticeAllowed(db,task,s) {
  if(!task.followupId) return true;
  const f=await db.one("DoseFollowup",{_id:task.followupId,patientId:task.patientId},s);
  if(!f||f.status!=="overdue-unconfirmed"||String(f.caregiverUserId)!==String(task.assigneeUserId)) return false;
  const pref=await db.one("FollowupSettings",{patientId:task.patientId,enabled:true,caregiverUserId:f.caregiverUserId},s);
  const dose=await db.one("DoseOccurrence",{_id:f.occurrenceId,patientId:f.patientId,state:"pending"},s);
  return !!pref && !!dose && await followupCaregiverAllowed(db,f.patientId,f.caregiverUserId,s);
}
