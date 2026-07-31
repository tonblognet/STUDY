import { PrismaClient, EducationLevel, StudyForm, PublicationStatus } from "@prisma/client";
import { hash } from "bcryptjs";
const db = new PrismaClient();
async function main(){
  const admin=await db.user.upsert({where:{email:"admin@postupai.ru"},update:{},create:{email:"admin@postupai.ru",name:"Администратор",passwordHash:await hash("Admin2026!",12),emailVerified:new Date(),role:"ADMIN"}});
  await db.user.upsert({where:{email:"demo@postupai.ru"},update:{},create:{email:"demo@postupai.ru",name:"Алекс",passwordHash:await hash("Demo2026!",12),emailVerified:new Date()}});
  const subjects=await Promise.all([["math","Математика"],["russian","Русский язык"],["informatics","Информатика"]].map(([slug,name])=>db.examSubject.upsert({where:{slug},update:{name},create:{slug,name}})));
  const university=await db.university.upsert({where:{slug:"hse"},update:{},create:{slug:"hse",name:"Национальный исследовательский университет «Высшая школа экономики»",shortName:"ВШЭ",websiteUrl:"https://www.hse.ru",status:PublicationStatus.PUBLISHED}});
  const program=await db.educationProgram.upsert({where:{slug:"hse-software-engineering"},update:{},create:{universityId:university.id,slug:"hse-software-engineering",code:"09.03.04",name:"Программная инженерия",level:EducationLevel.BACHELOR,form:StudyForm.FULL_TIME,durationMonths:48,status:PublicationStatus.PUBLISHED,publishedAt:new Date()}});
  const year=await db.admissionYear.upsert({where:{programId_year:{programId:program.id,year:2026}},update:{},create:{programId:program.id,year:2026}});
  await db.admissionPlan.upsert({where:{admissionYearId:year.id},update:{budgetPlaces:160,paidPlaces:250},create:{admissionYearId:year.id,budgetPlaces:160,paidPlaces:250}});
  await db.tuitionPrice.upsert({where:{admissionYearId_period:{admissionYearId:year.id,period:"YEAR"}},update:{amount:720000},create:{admissionYearId:year.id,amount:720000}});
  for(const [index,subject] of subjects.entries()) await db.entranceRequirement.upsert({where:{admissionYearId_subjectId_alternativesGroup:{admissionYearId:year.id,subjectId:subject.id,alternativesGroup:"required"}},update:{},create:{admissionYearId:year.id,subjectId:subject.id,priority:index+1,minScore:index===0?40:36,alternativesGroup:"required"}});
  await db.auditLog.create({data:{actorId:admin.id,action:"SEED_DATABASE",entityType:"System",after:{version:1}}});
}
main().finally(()=>db.$disconnect());
