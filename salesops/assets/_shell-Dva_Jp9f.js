import{u as l,j as e,c as o,w as h,O as i}from"./jsx-runtime-Cmm6gLNy.js";import{S as c}from"./shopping-cart-DRQyq9Bm.js";import{c as a}from"./createLucideIcon-BvlEoDVK.js";/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=a("ArrowLeftRight",[["path",{d:"M8 3 4 7l4 4",key:"9rb6wj"}],["path",{d:"M4 7h16",key:"6tx8e3"}],["path",{d:"m16 21 4-4-4-4",key:"siv7j2"}],["path",{d:"M20 17H4",key:"h6l3hr"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=a("BarChart3",[["path",{d:"M3 3v18h18",key:"1s2lah"}],["path",{d:"M18 17V9",key:"2bz60n"}],["path",{d:"M13 17V5",key:"1frdt8"}],["path",{d:"M8 17v-3",key:"17ska0"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=a("Landmark",[["line",{x1:"3",x2:"21",y1:"22",y2:"22",key:"j8o0r"}],["line",{x1:"6",x2:"6",y1:"18",y2:"11",key:"10tf0k"}],["line",{x1:"10",x2:"10",y1:"18",y2:"11",key:"54lgf6"}],["line",{x1:"14",x2:"14",y1:"18",y2:"11",key:"380y"}],["line",{x1:"18",x2:"18",y1:"18",y2:"11",key:"1kevvc"}],["polygon",{points:"12 2 20 7 4 7",key:"jkujk7"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=a("Package",[["path",{d:"m7.5 4.27 9 5.15",key:"1c824w"}],["path",{d:"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",key:"hh9hay"}],["path",{d:"m3.3 7 8.7 5 8.7-5",key:"g66t2b"}],["path",{d:"M12 22V12",key:"d0xqtd"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=a("Users",[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}],["path",{d:"M22 21v-2a4 4 0 0 0-3-3.87",key:"kshegd"}],["path",{d:"M16 3.13a4 4 0 0 1 0 7.75",key:"1da9ce"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m=a("Warehouse",[["path",{d:"M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z",key:"gksnxg"}],["path",{d:"M6 18h12",key:"9pbo8z"}],["path",{d:"M6 14h12",key:"4cwo0f"}],["rect",{width:"12",height:"12",x:"6",y:"10",key:"apd30q"}]]),f=[{label:"Nuevo pedido",path:"/pedidos/nuevo",icon:c},{label:"Operador de gestores",path:"/operador-gestores",icon:k},{label:"Operador de almacén",path:"/operador-almacen",icon:m},{label:"Tasas de cambio",path:"/tasas",icon:d},{label:"Inventario",path:"/inventario",icon:x},{label:"Decisiones",path:"/decisiones",icon:p},{label:"Finanzas",path:"/finanzas",icon:y}];function u(){const{pathname:s}=l();return e.jsxs("aside",{className:"flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface",children:[e.jsx(o,{to:"/",className:"px-4 py-5 text-lg font-bold text-text",children:"Sales Ops"}),e.jsx("nav",{"aria-label":"Main",className:"flex flex-col gap-1 px-2",children:f.map(t=>{const r=s===t.path,n=t.icon;return e.jsxs(o,{to:t.path,"aria-current":r?"page":void 0,className:`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${r?"bg-primary-light text-primary":"text-text hover:bg-background hover:text-primary"}`,children:[e.jsx(n,{className:"h-4 w-4 shrink-0","aria-hidden":"true"}),e.jsx("span",{children:t.label})]},t.path)})})]})}const j=h(function(){return e.jsxs("div",{className:"flex h-screen w-full overflow-hidden",children:[e.jsx(u,{}),e.jsx("main",{className:"flex-1 overflow-y-auto",children:e.jsx(i,{})})]})});export{j as default};
