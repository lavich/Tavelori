/** Компактная запись исходного слова. Набор без подготовленного контента задаёт только g, r и m. */
export interface SeedWord {
 g:string; r:string; m:boolean;
 ipa?:string;
 note?:string;
 n?:[string,string,string][];
 ex?:[string,string,string];
}
