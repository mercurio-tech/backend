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

export type Filter = {
    year?: string;
    tag?: string;
    professor?: string;
    type?: string;
}

export type AvailableFilters = {
    filters: Omit<Filter, "tag">[]
    tags: string[]
}

export const Admin = z.object({
    id: z.int(),
    nome: z.string(),
    senha: z.string(),
    permissao: z.enum(Perms),
});

export interface DBAdapter {
    /** Resolve quando o pool/arquivo está aberto e o schema garantido. */
    ready(): Promise<void>;

    isReady(): boolean;

    getNextId(): Promise<number>;
    getAvailableFilters(): Promise<AvailableFilters>;
    searchProject(
        query: string,
        page?: number,
    ): Promise<z.infer<typeof Project>[]>;
    getProjects(
        page: number,
        filters?: Filter,
    ): Promise<z.infer<typeof Project>[]>;
    getProject(id: string): Promise<z.infer<typeof Project> | null>;

    putProject(project: z.infer<typeof ProjectWithNoId>): Promise<void>;
    updateProject(
        project: z.infer<typeof ProjectOptionalExtension>,
    ): Promise<boolean>;
    deleteProject(id: number): Promise<boolean>;

    getAdminCount(): Promise<number>;
    adminExists(username: string): Promise<boolean>;
    insertAdmin(
        username: string,
        password: string,
        permission: Perms[keyof Perms],
    ): Promise<boolean | void>;
    verifyAuth(
        username: string,
        password: string,
        permissionLevel: Perms[keyof Perms],
    ): Promise<boolean>;
    getAdmin(username: string): Promise<z.infer<typeof Admin>>;

    close(): Promise<void>;
}

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

export const PageParamSchema = z
    .string()
    .trim()
    .regex(/^\d+$/, "Page must be a positive integer.")
    .transform((v) => parseInt(v, 10))
    .refine((n) => n >= 1, "Page must be >= 1.");

const OptionalFilterSchema = z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "null" || v === "" ? undefined : v));

export const FiltersParamsSchema = z.object({
    year: OptionalFilterSchema,
    tag: OptionalFilterSchema,
    professor: OptionalFilterSchema,
    type: OptionalFilterSchema,
});

export const ListProjectsParamsSchema = z.object({
    page: PageParamSchema.optional(),
    year: OptionalFilterSchema,
    tag: OptionalFilterSchema,
    professor: OptionalFilterSchema,
    type: OptionalFilterSchema,
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
