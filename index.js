const core = require('@actions/core');
const github = require('@actions/github');
const { Client } = require('@notionhq/client')

async function connectToNotion(notion) {
  const response = notion.databases.retrieve({ database_id: core.getInput('notion_database') })
  return response;
}


async function createCommit(notion, commits) {
  commits.forEach((commit) => {
    const array = commit.message.split(/\r?\n/);
    const title = array.shift();
    let description = ''
    array.forEach((element)=>{
      description +=  ' '+element
    })

    notion.pages.create({
      parent: {
        database_id: core.getInput('notion_database')
      },
      properties:
      {
        title: {
          title: [
            {
              type: 'text',
              text: {
                content: title
              }
            }
          ]
        },
        [core.getInput('commit_url')]:{
          url: commit.url
        },
        [core.getInput('commit_id')]:{
          rich_text:[
            {
              type: 'text',
              text:{
                content: commit.id
              }
            }
          ]
        },
        [core.getInput('commit_description')]:{
          rich_text:[
            {
              type: 'text',
              text:{
                content: description
              }
            }
          ]
        },
        [core.getInput('commit_project')]:{
          multi_select:[
            {
              name: github.context.repo.repo
            }
          ]
          
        }
      },
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            text: [
              {
                type: 'text',
                text: {
                  content: description
                }
              }
            ]
          }
        }
      ]
    })
  })
}


(async () => {
  try {
    const notion = new Client({ auth: core.getInput('notion_secret') })
    createCommit(notion, github.context.payload.commits)
  } catch (error) {

    core.setFailed(error.message);
  }
})();