const core = require("@actions/core");
const fetch = require("node-fetch");
const { createAppAuth } = require("@octokit/auth-app");

async function github_query(github_token, query, variables) {
  return fetch("https://api.github.com/graphql", {
    method: "POST",
    body: JSON.stringify({ query, variables }),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `bearer ${github_token}`
    }
  }).then(function(response) {
    return response.json();
  });
}

async function run() {
  try {
    const appId = core.getInput("app_id");
    const installation = core.getInput("installation_id");
    const privateKey = core.getInput("private_key");

    const issue = core.getInput("issue");
    const repository = core.getInput("repository");
    const project = core.getInput("project");
    const owner = repository.split("/")[0];
    const name = repository.split("/")[1];

    const auth = createAppAuth({
        id: appId,
        privateKey: privateKey,
        installationId: installation
    });

    const installationAuthentication = await auth({ type: "installation" });
    const github_token = installationAuthentication["token"];

    const get_issue_id = `
    query($owner:String!, $name:String!, $number:Int!){
      repository(owner: $owner, name: $name) {
        issue(number:$number) {
          id
        }
      }
    }`;
    const issue_vars = {
      owner,
      name,
      number: parseInt(issue)
    };

    const issue_resp = await github_query(
      github_token,
      get_issue_id,
      issue_vars
    );
    console.log(issue_resp);
    const issue_id = issue_resp["data"]["repository"]["issue"]["id"];

    const project_number = parseInt(project);
    var project_id;

    if (!Number.isInteger(project_number)) {
      project_id = project;
    }
    else {
      const get_project_id = `
      query($owner:String!, $name:String!, $number:Int!){
        repository(owner: $owner, name: $name) {
          project(number: $number) {
            id
          }
        }
      }`;
      const project_vars = {
        owner,
        name,
        number: parseInt(project)
      };

      const project_resp = await github_query(
        github_token,
        get_project_id,
        project_vars
      );
      console.log(project_resp);
      project_id = project_resp["data"]["repository"]["project"]["id"];
    }

    console.log(`Adding issue ${issue} to project ${project_id}`);
    console.log("");

    query = `
    mutation($issueId:ID!, $projectId:ID!) {
      updateIssue(input:{id:$issueId, projectIds:[$projectId]}) {
        issue {
          id
        }
      }
    }`;
    variables = { issueId: issue_id, projectId: project_id };

    response = await github_query(github_token, query, variables);
    console.log(response);
    console.log(`Done!`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
