function i(u,d,n){return n.filter(o=>u.every(e=>{const r=d.find(t=>t.warehouseId===o.id&&t.productId===e.productId);return r!==void 0&&r.quantity>=e.quantity}))}export{i as e};
