import {ArrowLeft, Menu} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import type {ReactNode} from 'react';

export function BrandBar({subtitle}:{subtitle?:string}){
 const navigate=useNavigate();
 return (
  <header className="topbar">
   <span className="brand">lexi</span>
   <span aria-hidden style={{fontSize:22}}>🇬🇷</span>
   {subtitle&&<span className="small muted">{subtitle}</span>}
   <span className="spacer"/>
   <button className="icon-btn" onClick={()=>navigate('/more')} aria-label="Ещё"><Menu size={24}/></button>
  </header>
 );
}
export function BackBar({title,right,onBack}:{title:string;right?:ReactNode;onBack?:()=>void}){
 const navigate=useNavigate();
 return (
  <header className="topbar">
   <button className="icon-btn" onClick={()=>onBack?onBack():navigate(-1)} aria-label="Назад"><ArrowLeft size={24}/></button>
   <span className="spacer"/>
   <h1 className="bar-title">{title}</h1>
   <span className="spacer"/>
   {right??<span style={{minWidth:44}}/>}
  </header>
 );
}
