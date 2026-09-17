'use client';
import {useCallback,useEffect,useState} from 'react';
// Only UI preferences: never records, PINs, tokens or form drafts.
export function usePreference<T>(key:string,initial:T,scope:'session'|'local'='session'){
 const [value,setValue]=useState<T>(initial),[ready,setReady]=useState(false);
 useEffect(()=>{try{const saved=(scope==='local'?localStorage:sessionStorage).getItem(`oled:ui:${key}`);if(saved!==null)setValue(JSON.parse(saved))}catch{}setReady(true)},[key,scope]);
 const update=useCallback((next:T|((old:T)=>T))=>setValue(old=>{const value=typeof next==='function'?(next as (old:T)=>T)(old):next;try{(scope==='local'?localStorage:sessionStorage).setItem(`oled:ui:${key}`,JSON.stringify(value))}catch{}return value}),[key,scope]);
 return [value,update,ready] as const;
}
