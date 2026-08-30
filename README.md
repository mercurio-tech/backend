# backend

Backend do Sistema de teses.
Inclue a implementação do banco de dados (via SQL) e uma API para consultas e para inserir dados no banco  
Dados da API ainda não definidos

## API Inicial (sujeito a mudanças)

## Objetos Principais

### Project

É a descrição de um projeto, baseado no que é armazenado no Banco de Dados
Estrutura:

```json
{
  id: number,
  titulo: string,
  subtitulo: string,
  descricao: string,
  aluno: string,
  professor: string,
  tipo: "SIP" || "SIC",
  ano: number,
  tags: string[],
  extensao: "png" || "jpg" || "jpeg",
}
```

Certas APIs possa demandar um projeto sem ID, porém isso geralmente e informado previamente

### AuthSchema

Utilizado em todas APIs em que necessita de permissões Admin
Estrutura:

```json
{
  username: string (min: 3, max: 20),
  password: string (min: 8, max : 18),
}
```

Cada resposta pode ser um erro ou sucesso.

- Estrutura de Erro:

```json
{
    "error": true,
    "result": "Error message"
}
```

- Estrutura de Sucesso:

```json
{
  "error": false,
  "result": Result
}
```

O resultado depende da api que você utilizou.

---

- /files/imagens/{id}/imagem.{extensao}
  Imagem associada ao projeto
- /files/pdfs/{id}/arquivo.pdf
  PDF associado ao projeto

- /getProjects/
  $\color{lime}{\textsf{GET}}$  
  Retorna os primeiros 10 projetos (ordenado por data)  
  (seria interessante se fosse possivel mudar como os dados sao ordenados e filtros)  
  result: [Project](#project)[]

- /getProjects/:page
  $\color{lime}{\textsf{GET}}$  
  Retorna os 10 projetos dessa pagina  
  :page deve ser um Inteiro positivo  
  result: [Project](#project)[]

- /getProjectDetails/:id
  $\color{lime}{\textsf{GET}}$  
  Retorna os dados de um projeto.  
  result: [Project](#project)

- /createProject/
  $\color{red}{\textsf{POST}}$  
  $\color{orange}{\textsf{Requer Admin}}$  
  (Espera-se um FormData, não JSON comum como as outras APIs)  
  Fields:
    - auth: O [AuthSchema](#authschema) comum em todas APIs admin, porém em string JSON (FormData não suporta json comum)
    - project: O [Project](#project), porém em string JSON (FormData não suporta json comum)
    - image: Imagem em PNG, JPEG ou JPG
    - pdf: PDF do projeto

- /updateProject/
  $\color{red}{\textsf{POST}}$  
  $\color{orange}{\textsf{Requer Admin}}$  
  TODO: documentar isso

- /isAdmin/
  $\color{red}{\textsf{POST}}$  
  Retorna se o usuario possui autenticação valida (não significa que é admin, talvez essa API deve ser renomeada)
  Fields:
    - auth: O [AuthSchema](#authschema) comum em todas APIs admin
      Resultado:  
      result: boolean

- /isAdminPresent/
  $\color{lightgreen}{\textsf{GET}}$  
  Retorna se há admins registrados na DB (importante para criar o primeiro admin)  
  result: boolean

- /registerAdmin/
  $\color{red}{\textsf{POST}}$  
  $\color{orange}{\textsf{Requer Admin}}$  
  Registra um novo admin
  Fields:
    - auth: O [AuthSchema](#authschema) comum em todas APIs admin
    - username: string (limite 20 char)
    - password: string (limite 18 char)
    - permission : [Perms](tipos.ts#L17)
