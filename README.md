# Convite de 1 ano da Laura

Landing page mobile feita com HTML, CSS e JavaScript. Inclui contagem regressiva, localização, confirmação de presença por link individual, lista de presentes com reserva, álbum com envio direto de fotos e painel da família.

## Abrir localmente

Dê dois cliques em `index.html`. O CSS, o JavaScript e as imagens usam caminhos relativos e funcionam diretamente na pasta. Não é necessário instalar pacotes para visualizar a página.

Sem API configurada, o site entra em **modo local**. O painel abre pelo ícone de engrenagem. Nesse modo, as alterações ficam apenas no navegador usado para editar. Links copiados não compartilham dados com outros aparelhos.

## Publicar na Vercel com dados compartilhados

1. Envie esta pasta para um repositório GitHub e importe o projeto na Vercel. Selecione o preset **Other**. O `vercel.json` executa `node build.cjs` e publica a pasta `dist`.
2. Crie um banco **Upstash Redis** e copie a REST URL e o REST Token.
3. Em *Project Settings → Environment Variables* da Vercel, configure as quatro variáveis de [.env.example](.env.example): `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ADMIN_PASSWORD` e `SESSION_SECRET`.
4. No projeto da Vercel, abra **Storage → Create Database → Blob**, crie um armazenamento **Public** e conecte ao projeto. O SDK usa a configuração criada pela Vercel para publicar as fotos.
5. Use uma senha forte para `ADMIN_PASSWORD` e um segredo aleatório longo para `SESSION_SECRET`. Faça novo deploy depois de salvar as variáveis e conectar o Blob.
6. Abra o painel da família, entre com a senha e revise a data, o endereço, os convidados e os presentes antes de compartilhar os links.

Com o Redis e o Blob configurados, convidados, confirmações, reservas, fotos enviadas do celular e dados do evento são compartilhados entre aparelhos. O painel usa cookie de sessão com assinatura e a lista completa de convidados só é enviada ao administrador. Cada convidado recebe um link com identificador único. Evite publicar esses links em locais abertos.

## Como adicionar fotos pelo celular

1. Depois do deploy, abra o endereço da landing page no celular.
2. Toque na **engrenagem** no topo, entre com a senha de administrador e abra a aba **Álbum**.
3. Toque em **Escolher arquivo**, selecione uma foto da galeria, escreva uma legenda se quiser e toque em **Publicar foto**.

A foto é reduzida no celular antes do envio e aparece no álbum sem novo deploy. Sua esposa precisa da senha de administrador; não precisa acessar GitHub nem editar arquivos. Ao abrir `index.html` diretamente no computador, o envio funciona apenas como prévia salva naquele navegador.

## Ajustes do evento e fotos

- A data do convite foi interpretada como **28 de fevereiro de 2027, às 15h**, por ser o próximo 28 de fevereiro após a criação do projeto. Confirme o ano no painel antes de enviar os convites.
- O endereço inicial é **Rua Presidente João Goulart, 585 — Salão de Festas 2**, conforme a imagem enviada. Confirme a cidade e substitua o link do mapa se necessário.
- As duas imagens fornecidas estão em `images` e aparecem inicialmente no site. O painel aceita fotos do celular e, como alternativa, um link público de imagem.
- A lista de presentes começa vazia para que a família cadastre apenas os itens desejados.

## Estrutura

- `index.html`: seções do convite.
- `src/style.css`: visual mobile.
- `src/main.js`: interações, painel e modo local.
- `api/data.js`: API serverless da Vercel e armazenamento Redis.
- `api/upload.js`: envio de fotos ao Vercel Blob.
