/** Camera-relative eight-way artwork; odd sectors are real painted diagonal views. */
export function directionFrame(x:number,z:number,angel:boolean){
 const sector=(Math.round(Math.atan2(x,z)/(Math.PI/4))+8)%8;
 const diagonal=sector%2===1;
 const column=diagonal?(sector-1)/2:sector===0?0:sector===4?2:sector===2?(angel?1:3):(angel?3:1);
 return {sector,diagonal,column};
}
