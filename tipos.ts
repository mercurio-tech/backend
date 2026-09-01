import * as z from "zod";
export const Project = z.object({
    id: z.int(),
    titulo: z.string(),
    subtitulo: z.string(),
    descricao: z.string(),
    aluno: z.string(),
    professor: z.string(),
    tipo: z.string(),
    ano: z.int(),
    tags: z.array(z.string()),
    extensao: z.string(),
});

export const ProjectOptionalExtension = z.object({
    id: z.int(),
    titulo: z.string(),
    subtitulo: z.string(),
    descricao: z.string(),
    aluno: z.string(),
    professor: z.string(),
    tipo: z.string(),
    ano: z.int(),
    tags: z.array(z.string()),
    extensao: z.optional(z.string()),
});

export const ProjectWithNoId = Project.omit({ id: true });

export const Perms = {
    EDITOR: 100,
    ADMIN: 999,
} as const;
export type Perms = typeof Perms;

export const Admin = z.object({
    id: z.int(),
    nome: z.string(),
    senha: z.string(),
    permissao: z.enum(Perms),
});

export const AuthSchema = z.object({
    username: z.string().min(3).max(20),
    password: z.string().min(8).max(18),
});

export const IsAdminSchema = z.object({
    auth: AuthSchema,
});

export const RegisterAdminSchema = z.object({
    auth: z.optional(AuthSchema),
    username: z.string().min(3).max(20),
    password: z.string().min(8).max(18),
    permission: z.enum(Perms),
});

export const CreateProjectSchema = z.object({
    auth: AuthSchema,
    project: ProjectWithNoId.omit({ extensao: true }),
});

export const CreateProjectReq = z.object({
    auth: z.string(),
    project: z.string(),
});

export const UpdateProjectSchema = z.object({
    auth: AuthSchema,
    project: Project.omit({ extensao: true }),
});

export const DeleteProjectSchema = z.object({
    auth: AuthSchema,
    id: z.number(),
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

export interface GetProjectResponse extends ResponseSuccess<
    z.infer<typeof Project>
> {}

export interface GetAdminPresentResponse extends ResponseSuccess<boolean> {}

export interface RegisterAdminResponse extends ResponseSuccess<string> {}
export interface RegisterAdminRequest extends z.infer<
    typeof RegisterAdminSchema
> {}
