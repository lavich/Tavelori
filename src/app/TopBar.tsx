import {ArrowLeft, Menu} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import type {ReactNode} from 'react';
import ui from '../shared/ui.module.css';
import top from './TopBar.module.css';
import {cx} from '../shared/cx';

export function BrandBar({subtitle}:{subtitle?:string}){
 const navigate=useNavigate();
 return (
  <header className={top.topbar}>
   <span className={top.brand}>lexi</span>
   <span aria-hidden style={{fontSize:22}}>🇬🇷</span>
   {subtitle&&<span className={cx(ui.small, ui.muted)}>{subtitle}</span>}
   <span className={top.spacer}/>
   <Button variant="ghost" size="icon-lg" className="size-11" onClick={()=>navigate('/more')} aria-label="Ещё"><Menu/></Button>
  </header>
 );
}
export function BackBar({title,right,onBack}:{title:string;right?:ReactNode;onBack?:()=>void}){
 const navigate=useNavigate();
 return (
  <header className={top.topbar}>
   <Button variant="ghost" size="icon-lg" className="size-11 -ml-2" onClick={()=>onBack?onBack():navigate(-1)} aria-label="Назад"><ArrowLeft/></Button>
   <span className={top.spacer}/>
   <h1 className={top.title}>{title}</h1>
   <span className={top.spacer}/>
   {right??<span style={{minWidth:44}}/>}
  </header>
 );
}
