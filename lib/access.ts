export type AccessContext={userId:string|null;role:"GUEST"|"USER"|"SUBSCRIBER"|"EDITOR"|"ADMIN";subscriptionActive:boolean};
export function canViewPremium(ctx:AccessContext){return ctx.subscriptionActive||ctx.role==="SUBSCRIBER"||ctx.role==="EDITOR"||ctx.role==="ADMIN"}
export function canEditContent(ctx:AccessContext){return ctx.role==="EDITOR"||ctx.role==="ADMIN"}
export function publicProgram<T extends {previousScores:unknown[];paidPlaces:unknown;tuition:unknown;dvi:unknown}>(program:T,premium:boolean){return premium?program:{...program,previousScores:program.previousScores.slice(0,1),paidPlaces:null,tuition:null,dvi:program.dvi?"Доступно с Плюс":null}}
