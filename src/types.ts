export type Point={x:number;y:number};
export type Matrix=[number,number,number,number,number,number];
export type Bounds={minX:number;minY:number;maxX:number;maxY:number};
export type Primitive={points:Point[];color:string;layer:string;closed?:boolean;fill?:boolean;text?:string;textAlign?:CanvasTextAlign;textOffsetX?:number;textFitWidth?:number;height?:number;matrix?:Matrix;bounds:Bounds;node:string;clip?:Bounds};
export type Item={id:string;label:string;type:string;layer:string;bounds:Bounds;children:Item[];primitives:number[]};
export type Scene={primitives:Primitive[];items:Item[];bounds:Bounds;layers:{name:string;color:string;off:boolean}[];spaces:string[];space:string;unsupported:Record<string,number>;unknown:number;warnings?:number[]};
