# Convite de 1 ano da Laura

Landing page mobile feita com HTML, CSS e JavaScript. Inclui contagem regressiva, localização, confirmação de presença por link individual, lista de presentes com reserva, álbum e painel da família.

## Rodar localmente

1. Instale Node.js 20 ou mais recente.
2. Na pasta do projeto, execute `npm install` e `npm run dev`.
3. Abra o endereço mostrado no terminal.

Sem API configurada, o site entra em **modo local**. O painel abre pelo ícone de engrenagem. Nesse modo, as alterações ficam apenas no navegador usado para editar. Links copiados não compartilham dados com outros aparelhos.

## Publicar na Vercel com dados compartilhados

1. Envie esta pasta para um repositório GitHub e importe o projeto na Vercel. O preset Vite deve ser detectado; o comando de build é `npm run build` e a pasta de saída é `dist`.
2. Crie um banco **Upstash Redis** e copie a REST URL e o REST Token.
3. Em *Project Settings → Environment Variables* da Vercel, configure as quatro variáveis de [.env.example](.env.example): `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ADMIN_PASSWORD` e `SESSION_SECRET`.
4. Use uma senha forte para `ADMIN_PASSWORD` e um segredo aleatório longo para `SESSION_SECRET`. Faça novo deploy depois de salvar as variáveis.
5. Abra o painel da família, entre com a senha e revise a data, o endereço, os convidados e os presentes antes de compartilhar os links.

Com o Redis configurado, convidados, confirmações, reservas, fotos adicionadas por URL e dados do evento são compartilhados entre aparelhos. O painel usa cookie de sessão com assinatura e a lista completa de convidados só é enviada ao administrador. Cada convidado recebe um link com identificador único. Evite publicar esses links em locais abertos.

## Ajustes do evento e fotos

- A data do convite foi interpretada como **28 de fevereiro de 2027, às 15h**, por ser o próximo 28 de fevereiro após a criação do projeto. Confirme o ano no painel antes de enviar os convites.
- O endereço inicial é **Rua Presidente João Goulart, 585 — Salão de Festas 2**, conforme a imagem enviada. Confirme a cidade e substitua o link do mapa se necessário.
- As duas imagens fornecidas estão em `public/images` e aparecem inicialmente no site. Para acrescentar fotos pessoais, coloque os arquivos nessa pasta, faça deploy e adicione `/images/nome-do-arquivo.jpg` no painel. Também é possível usar uma URL pública HTTPS de imagem. O painel não envia arquivos diretamente ao servidor.
- A lista de presentes começa vazia para que a família cadastre apenas os itens desejados.

## Estrutura

- `index.html`: seções do convite.
- `src/style.css`: visual mobile.
- `src/main.js`: interações, painel e modo local.
- `api/data.js`: API serverless da Vercel e armazenamento Redis.
