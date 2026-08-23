# backend

Backend do Sistema de teses.
Inclue a implementação do banco de dados (via SQL) e uma API para consultas e para inserir dados no banco  
Dados da API ainda não definidos

## API Inicial (sujeito a mudanças)

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

- /getProjects/
  Retorna os primeiros 10 projetos (ordenado por data)  
  (seria interessante se fosse possivel mudar como os dados sao ordenados e filtros)  
  result: [Project](tipos.ts#L2)[]

- /getProjects/:page
  Retorna os 10 projetos dessa pagina  
  :page deve ser um Inteiro positivo  
  result: [Project](tipos.ts#L2)[]

- /getProjectDetails/:id
  Retorna os dados detalhados de um projeto.  
  (Adiciona o campo PDF)  
  result: [DetailedProject](tipos.ts#L12)

TODO: Documentar API de Admin
