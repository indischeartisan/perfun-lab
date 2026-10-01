export type NoteLayer = 'top' | 'middle' | 'base'
export interface ScentProfile { fresh:number; sweet:number; floral:number; green:number; warm:number; woody:number; clean:number; creamy:number; aquatic:number }
export interface FragranceNote { id:string; name:string; layer:NoteLayer; category:string; shortDescription:string; predictionText:string; stickerColor:string; icon?:string; stickerAsset?:string; profile:ScentProfile }
