export const cardCollections = [
 {id:'angel-small',actor:'angel',style:'small',name:'فرشته · کوچک',image:'/art/cards-angel-small.webp',titles:['خوش‌آمد باغ','پرواز ستاره‌ها','بذر امید','کتاب روح','فانوس تازه','دوست بال‌دار']},
 {id:'gor-small',actor:'gor',style:'small',name:'گوراستاخ · کوچک',image:'/art/cards-gor-small.webp',titles:['دیدار فرمانروا','شناوری روح','مراقبت از گل','راز کتاب','اختراع بلوری','دوست جنگل']},
 {id:'angel-adult',actor:'angel',style:'adult',name:'فرشته · بزرگسالانه',image:'/art/cards-angel-adult.webp',titles:['دروازهٔ سپیده','پرواز ماه','آیین شکوفایی','کتابخانهٔ نور','آفرینش فانوس','آرامش باغ']},
 {id:'gor-adult',actor:'gor',style:'adult',name:'گوراستاخ · بزرگسالانه',image:'/art/cards-gor-adult.webp',titles:['فرمانروای نور','آیین شناوری','نگهبان طبیعت','دانش کهن','معمار جادو','شب آرام']},
] as const;
export const memoryCards=cardCollections.flatMap(collection=>collection.titles.map((title,index)=>({id:`${collection.id}-${index}`,title,index,collection})));
export function cardImageStyle(card:typeof memoryCards[number]){return `background-image:url('${card.collection.image}');background-position:${card.index%3*50}% ${Math.floor(card.index/3)*100}%`;}
