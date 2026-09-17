export type AppRoute={view:string;id:string;search?:string};
const views=new Set(['dashboard','orders','detail','customers','devices','screens','products','suppliers','payments','reports','users','audit','notifications','stock','settings']);
export function parseRoute(hash:string):AppRoute{const [path,query='']=hash.replace(/^#/,'').split('?');const [view,id='']=path.split('/');if(!views.has(view)||view==='detail'&&!id)return {view:'dashboard',id:''};return {view,id,search:new URLSearchParams(query).get('q')||undefined}}
export function routeHash(route:AppRoute){return `#${route.view}${route.id?`/${route.id}`:''}${route.search?`?q=${encodeURIComponent(route.search)}`:''}`}
