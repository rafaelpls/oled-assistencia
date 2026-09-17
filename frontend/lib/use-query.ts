'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from './api';
export function useDebounced<T>(value:T,delay=250){const [debounced,setDebounced]=useState(value);useEffect(()=>{const timer=setTimeout(()=>setDebounced(value),delay);return()=>clearTimeout(timer)},[value,delay]);return debounced}
export function useQuery<T>(url:string|null){const [data,setData]=useState<T|null>(null),[pending,setPending]=useState(!!url),[error,setError]=useState('');const controller=useRef<AbortController|null>(null);
 const reload=useCallback(async()=>{controller.current?.abort();if(!url){setPending(false);return}const request=new AbortController();controller.current=request;setPending(true);setError('');try{const result=await api(url,{signal:request.signal});if(!request.signal.aborted)setData(result)}catch(e:any){if(!request.signal.aborted)setError(e.message)}finally{if(!request.signal.aborted)setPending(false)}},[url]);
 useEffect(()=>{void reload();return()=>controller.current?.abort()},[reload]);return {data,pending,error,reload};
}
const memory=new Map<string,unknown>();
export function clearViewMemory(){memory.clear()}
export function useViewState<T>(key:string,initial:T){const [value,setValue]=useState<T>(()=>(memory.get(key) as T)??initial);const update=useCallback((next:T|((old:T)=>T))=>{setValue(old=>{const resolved=typeof next==='function'?(next as (v:T)=>T)(old):next;memory.set(key,resolved);return resolved})},[key]);return [value,update] as const}
