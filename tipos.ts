import * as z from "zod";
export const Project = z.object({
  id: z.int(),
  titulo: z.string(),
  subtitulo: z.string(),
  aluno: z.string(),
  professor: z.string(),
  tipo: z.string(),
  ano: z.int(),
  tags: z.array(z.string()),
  imagem: z.string(),
});

export const DetailedProject = z.object({
  id: z.int(),
  titulo: z.string(),
  subtitulo: z.string(),
  aluno: z.string(),
  professor: z.string(),
  tipo: z.string(),
  ano: z.int(),
  tags: z.array(z.string()),
  imagem: z.string(),
  pdf: z.string(),
});

export const DetailedProjectWithNoId = DetailedProject.omit({ id: true });
export const Admin = z.object({
  id: z.int(),
  nome: z.string(),
  senha: z.string(),
  permissao: z.enum(["admin", "editor"]),
});

export const AuthSchema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(8).max(100),
});

export const IsAdminSchema = z.object({
  auth: AuthSchema,
})

export const RegisterAdminSchema = z.object({
  auth: z.optional(AuthSchema),
  username: z.string().min(3).max(20),
  password: z.string().min(8).max(100),
  permission: z.enum(["admin", "editor"]),
});

export const CreateProjectSchema = z.object({
  auth: AuthSchema,
  project: DetailedProject.omit({id: true})
})

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

export interface RegisterAdminResponse extends ResponseSuccess<string> {}
export interface RegisterAdminRequest extends z.infer<
  typeof RegisterAdminSchema
> {}