import {useState} from 'react';
import {Pencil} from 'lucide-react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {BackBar} from '../../app/TopBar';
import {useNow} from '../../shared/clock';
import {shortTitle} from '../../shared/format';
import {lessonsOf, useSnapshot, useWord} from '../../shared/store';
import {ExampleBox, ReadingNotes, SpeakButton, WordArt} from './WordCardView';
import {startSession} from '../learning/session-actions';

export function WordScreen(){
 const {id}=useParams();
 const word=useWord(id);
 const {data}=useSnapshot();
 const now=useNow();
 const navigate=useNavigate();
 const [problem,setProblem]=useState('');
 if(!word)return <><BackBar title="Слово"/><main className="screen"><p className="muted">Слово не найдено.</p></main></>;
 const lessons=lessonsOf(data,word.id);
 const practice=async()=>{
  const session=await startSession(data,now,{wordIds:[word.id],mode:'practice'});
  if(!session)return setProblem('Не удалось собрать тренировку для этого слова.');
  navigate('/session');
 };
 return (
  <>
   <BackBar title={lessons[0]?lessons[0].title:'Слово'}
    right={<Link className="icon-btn" to={`/words/${word.id}/edit`} aria-label="Редактировать слово"><Pencil size={22}/></Link>}/>
   <main className="screen">
    <WordArt word={word}/>
    <div className="row between" style={{margin:'16px 0 2px',gap:12}}>
     <div className="grow" style={{minWidth:0}}>
      <p className="greek" style={{margin:0}}>{word.greek}</p>
      {word.ipa&&<p className="ipa" style={{margin:0}}>{word.ipa}</p>}
     </div>
     <SpeakButton word={word}/>
    </div>
    <p style={{fontSize:19,margin:'8px 0 14px'}}>{word.russian}</p>
    {!word.verified&&<p className="small muted">Фонетика не проверена — её можно уточнить в редакторе.</p>}
    <ReadingNotes word={word}/>
    {word.examples.length
     ?word.examples.map((example,index)=><ExampleBox key={index} example={example}/>)
     :<section className="card flat small muted">Примера употребления пока нет. <Link to={`/words/${word.id}/edit`}>Добавить пример</Link></section>}
    <p>{lessons.map(lesson=><Link key={lesson.id} to={`/lessons/${lesson.id}`} style={{textDecoration:'none',marginRight:8}}><span className="chip">{shortTitle(lesson.title)}</span></Link>)}</p>
    <button className="btn ghost" onClick={practice}>Потренировать слово</button>
    {problem&&<p className="error">{problem}</p>}
   </main>
  </>
 );
}
