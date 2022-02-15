const core = require("@actions/core");
const github = require("@actions/github");
const { GitHub } = require("@actions/github/lib/utils");
const { Client } = require("@notionhq/client");
const { createTokenAuth } = require("@octokit/auth-token");
const { Octokit } = require("@octokit/core");
const {
  restEndpointMethods,
} = require("@octokit/plugin-rest-endpoint-methods");

async function createCommit(notion, commits) {
  let fileFormat = core.getInput("files_format");
  if (core.getInput("token") === "") fileFormat = "none";
  var files = await getFiles();
  commits.forEach((commit) => {
    const array = commit.message.split(/\r?\n/);
    const title = array.shift();
    let description = "";
    array.forEach((element) => {
      description += " " + element;
    });

    let filesBlock;
    switch (fileFormat) {
      case "text-list":
        core.info("Formatting Notion Block for:");
        core.info(files);
        filesBlock = {
          object: "block",
          type: "toggle",
          toggle: {
            text: [
              {
                type: "text",
                text: {
                  content: "Files",
                  link: null,
                },
                annotations: {
                  bold: true,
                  italic: false,
                  strikethrough: false,
                  underline: false,
                  code: false,
                  color: "default",
                },
              },
            ],
            children: [
              {
                type: "paragraph",
                paragraph: {
                  text: [
                    {
                      type: "text",
                      text: {
                        content: files,
                      },
                    },
                  ],
                },
              },
            ],
          },
        };

        break;
      case "none":
        core.info("No file will be listed");
        break;

      default:
        core.setFailed(
          "Other files list tipes not supported or file type not specified."
        );
        break;
    }

    notion.pages.create({
      parent: {
        database_id: core.getInput("notion_database"),
      },
      properties: {
        title: {
          title: [
            {
              type: "text",
              text: {
                content: title,
              },
            },
          ],
        },
        [core.getInput("commit_url")]: {
          url: commit.url,
        },
        [core.getInput("commit_id")]: {
          rich_text: [
            {
              type: "text",
              text: {
                content: commit.id,
              },
            },
          ],
        },
        [core.getInput("commit_description")]: {
          rich_text: [
            {
              type: "text",
              text: {
                content: description,
              },
            },
          ],
        },
        [core.getInput("commit_project")]: {
          multi_select: [
            {
              name: github.context.repo.repo,
            },
          ],
        },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            text: [
              {
                type: "text",
                text: {
                  content: description,
                },
              },
            ],
          },
        },
        filesBlock,
      ],
    });
  });
}

(async () => {
  try {
    const notion = new Client({ auth: core.getInput("notion_secret") });
    createCommit(notion, github.context.payload.commits);
  } catch (error) {
    core.setFailed(error.message);
  }
})();

async function getFiles() {
  try {
    const MyOctokit = Octokit.plugin(restEndpointMethods);
    const octokit = new MyOctokit({
      auth: core.getInput("token", { required: true }),
    });
    const format = core.getInput("files_format", { required: true });

    if (format !== "text-list") {
      core.setFailed("file output format not supported.");
    }
    core.debug(`Payload keys: ${Object.keys(github.context.payload)}`);
    const eventName = github.context.eventName;

    switch (eventName) {
      case "pull_request":
        base = github.context.payload.pull_request.base.sha;
        head = github.context.payload.pull_request.head.sha;
        break;
      case "push":
        base = github.context.payload.before;
        head = github.context.payload.after;
        break;
      default:
        core.setFailed(
          `This action only supports pull requests and pushes, ${github.context.eventName} events are not supported. ` +
            "Please submit an issue on this action's GitHub repo if you believe this in correct."
        );
    }

    core.info(`Base commit: ${base}`);
    core.info(`Head commit: ${head}`);

    if (!base || !head) {
      core.setFailed(
        `The base and head commits are missing from the payload for this ${github.context.eventName} event. ` +
          "Please submit an issue on this action's GitHub repo."
      );

      base = "";
      head = "";
    }

    const response = await octokit.repos.compareCommits({
      base,
      head,
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
    });

    if (response.status !== 200) {
      core.setFailed(
        `The GitHub API for comparing the base and head commits for this ${github.context.eventName} event returned ${response.status}, expected 200. ` +
          "Please submit an issue on this action's GitHub repo."
      );
    }

    if (response.data.status !== "ahead") {
      core.setFailed(
        `The head commit for this ${github.context.eventName} event is not ahead of the base commit. ` +
          "Please submit an issue on this action's GitHub repo."
      );
    }

    // Get the changed files from the response payload.
    const files = response.data.files;
    const all = [],
      added = [],
      modified = [],
      removed = [],
      renamed = [],
      addedModified = [];
    for (const file of files) {
      const filename = file.filename;
      if (format === "text-list" && filename.includes(" ")) {
        core.setFailed(
          `One of your files includes a space. Consider using a different output format or removing spaces from your filenames. ` +
            "Please submit an issue on this action's GitHub repo."
        );
      }
      all.push(filename);
      switch (file.status) {
        case "added":
          added.push(filename);
          addedModified.push(filename);
          break;
        case "modified":
          modified.push(filename);
          addedModified.push(filename);
          break;
        case "removed":
          removed.push(filename);
          break;
        case "renamed":
          renamed.push(filename);
          break;
        default:
          core.setFailed(
            `One of your files includes an unsupported file status '${file.status}', expected 'added', 'modified', 'removed', or 'renamed'.`
          );
      }
    }

    let allFormatted,
      addedFormatted,
      modifiedFormatted,
      removedFormatted,
      renamedFormatted,
      addedModifiedFormatted;
    switch (format) {
      case "text-list":
        for (const file of all) {
          if (file.includes(" "))
            core.setFailed(
              `One of your files includes a space. Consider using a different output format or removing spaces from your filenames.`
            );
        }
        allFormatted = all.join(" ");
        addedFormatted = added.join(" ");
        modifiedFormatted = modified.join(" ");
        removedFormatted = removed.join(" ");
        renamedFormatted = renamed.join(" ");
        addedModifiedFormatted = addedModified.join(" ");
        break;
      case "csv":
        allFormatted = all.join(",");
        addedFormatted = added.join(",");
        modifiedFormatted = modified.join(",");
        removedFormatted = removed.join(",");
        renamedFormatted = renamed.join(",");
        addedModifiedFormatted = addedModified.join(",");
        break;
      case "json":
        allFormatted = JSON.stringify(all);
        addedFormatted = JSON.stringify(added);
        modifiedFormatted = JSON.stringify(modified);
        removedFormatted = JSON.stringify(removed);
        renamedFormatted = JSON.stringify(renamed);
        addedModifiedFormatted = JSON.stringify(addedModified);
        break;
    }

    // Log the output values.s
    // core.info(`All: ${allFormatted}`);
    // core.info(`Added: ${addedFormatted}`);
    // core.info(`Modified: ${modifiedFormatted}`);
    // core.info(`Removed: ${removedFormatted}`);
    // core.info(`Renamed: ${renamedFormatted}`);
    // core.info(`Added or modified: ${addedModifiedFormatted}`);

    let outPutMessage =
      (addedFormatted != "" ? "Added: \n" + addedFormatted : "") +
      (modifiedFormatted != "" ? "Modified \n" + modifiedFormatted : "") +
      (removedFormatted != "" ? "Removed: \n" + removedFormatted : "") +
      (renamedFormatted != "" ? "Renamed: \n" + renamedFormatted : "");
    return outPutMessage;
  } catch (error) {
    core.info("error " + error + " occurred");
  }
}
