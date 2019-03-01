export interface Image {
    id: number;
    name: string;
    width: number;
    height: number;
    url: string;
    annotations: AnnotationInImage[];
}


export interface AnnotationInImage {
    id: number;
    concealed: boolean;
    blurred: boolean;
    closed: boolean;
    notInImage: boolean;
    annotationType: number;
    vector?: object;
}
