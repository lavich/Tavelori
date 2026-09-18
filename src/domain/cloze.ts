import {GAP} from '../content/schema';

/**
 * Проверка письменного ответа для карточки пропуска и целой фразы. Она отдельна от словарного
 * `checkAnswer`: артикль, отрицание, предлог, форма слова, пунктуация и лишний текст не прощаются
 * и не угадываются — другое написание допускается только явным ответом из материала.
 * Порядок: все точные варианты, затем все варианты без знака ударения (диерезис остаётся значимым).
 * Проверка локальная и детерминированная; генеративный сервис не участвует.
 */
export type TextAnswerStatus='correct'|'almost'|'wrong';
export interface TextAnswerResult {status:TextAnswerStatus;message:string;/** Вариант для показа: совпавший допустимый либо канонический (первый). */expected:string}

/** NFC, регистр, внешние и повторные пробелы, конечная сигма. Пунктуация остаётся. */
export const normalizeText=(value:string)=>value.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('el').replace(/ς/g,'σ');
/** Снимается только знак ударения (U+0301); диерезис (U+0308) сохраняется. */
export const stripAccent=(value:string)=>value.normalize('NFD').replace(/́/g,'').normalize('NFC');

export const MESSAGES={
 correct:'Правильно!',
 almost:'Почти! Проверь ударение.',
 wrong:'Пока не получилось. Запомним и повторим.',
 gapOnly:'Нужно заполнить только пропуск, а не всё предложение.',
} as const;

export function checkTextAnswer(answer:string,acceptedAnswers:readonly string[],options:{template?:string}={}):TextAnswerResult{
 const canonical=acceptedAnswers[0]??'';
 const given=normalizeText(answer);
 if(!given||!acceptedAnswers.length)return {status:'wrong',message:MESSAGES.wrong,expected:canonical};
 const exact=acceptedAnswers.find(accepted=>normalizeText(accepted)===given);
 if(exact!==undefined)return {status:'correct',message:MESSAGES.correct,expected:exact};
 const bare=stripAccent(given);
 const almost=acceptedAnswers.find(accepted=>stripAccent(normalizeText(accepted))===bare);
 if(almost!==undefined)return {status:'almost',message:MESSAGES.almost,expected:almost};
 return {status:'wrong',message:wholeSentence(given,acceptedAnswers,options.template)?MESSAGES.gapOnly:MESSAGES.wrong,expected:canonical};
}

/** Пользователь ввёл предложение целиком: ответ восстанавливает шаблон с одним из допустимых вариантов. */
function wholeSentence(given:string,acceptedAnswers:readonly string[],template:string|undefined){
 if(!template||!template.includes(GAP))return false;
 const bare=stripAccent(given);
 return acceptedAnswers.some(accepted=>stripAccent(normalizeText(fillGap(template,accepted)))===bare);
}

export const splitTemplate=(template:string):{before:string;after:string}=>{
 const at=template.indexOf(GAP);
 if(at<0)return {before:template,after:''};
 return {before:template.slice(0,at),after:template.slice(at+GAP.length)};
};
/** Подстановка ответа в размеченное место; повторяющаяся форма в остальном тексте не трогается. */
export const fillGap=(template:string,answer:string)=>{
 const {before,after}=splitTemplate(template);
 return `${before}${answer}${after}`;
};
