import * as z from "zod";
export const Project = z.object({
  id: z.int(),
  titulo: z.string(),
  subtitulo: z.string(),
  aluno: z.string(),
  ano: z.int(),
  tags: z.array(z.string()),
  imagem: z.string(),
});

export const DetailedProject = z.object({
  id: z.int(),
  titulo: z.string(),
  subtitulo: z.string(),
  aluno: z.string(),
  ano: z.int(),
  tags: z.array(z.string()),
  imagem: z.string(),
  pdf: z.string(),
});

export interface ResponseError {
  error: true;
  result: string;
}

export interface ResponseSuccess<T> {
  error: false;
  result: T;
}
export interface GetProjectsResponse extends ResponseSuccess<
  z.infer<typeof Project>[]
> {}

export interface GetProjectDetailsResponse extends ResponseSuccess<
  z.infer<typeof DetailedProject>
> {}
