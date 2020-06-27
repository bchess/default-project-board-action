const core = require("@actions/core");
const fetch = require("node-fetch");
const { createAppAuth } = require("@octokit/auth-app");
const { request } = require("@octokit/request");

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
    const privateKey = core.getInput("private_key");

    const issue = core.getInput("issue");
    const pull_request = core.getInput("pull_request");
    const repository = core.getInput("repository");
    const project = core.getInput("project");
    const owner = repository.split("/")[0];
    const name = repository.split("/")[1];

    // First look up installation id for the owner (organization)
    const auth = createAppAuth({
        id: appId,
        privateKey: privateKey,
    });

    const { data: installations } = await auth.hook(
      request.defaults({headers: {accept: "application/vnd.github.machine-man-preview+json" } }),
      "GET /app/installations"
    );
    installationId = installations.find(installation => installation['account']['login'] == owner)["id"]
    console.log(`Installation for ${owner} is ${installationId}`);

    // Get a token to access this installation
    const installationAuthentication = await auth({
        type: "installation",
        installationId: installationId
    });
    const github_token = installationAuthentication["token"];

    // Look up the project ID
    const project_number = parseInt(project);

    const get_project_id = `
    query($organization:String!, $project:String!){
      organization(login: $organization) {
        projects( search: $project, first: 10, states: [OPEN] ) {
          nodes {
            id
          }
        }
      }
    }`;
    const project_vars = {
      organization: owner,
      project
    };

    const project_resp = await github_query(
      github_token,
      get_project_id,
      project_vars
    );
    console.log(project_resp);
    const project_id = project_resp["data"]["organization"]["projects"]["nodes"][0]["id"];


    var issue_id;
    var pull_request_id;
    if (issue) {
        // Look up the issue ID
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
    }
    else if (pull_request) {
        // Look up the pull request ID
        const get_pull_request_id = `
        query($owner:String!, $name:String!, $number:Int!){
          repository(owner: $owner, name: $name) {
            pullRequest(number:$number) {
              id
            }
          }
        }`;
        const pull_request_vars = {
          owner,
          name,
          number: parseInt(pull_request)
        };

        const pull_request_resp = await github_query(
          github_token,
          get_pull_request_id,
          pull_request_vars
        );
        console.log(pull_request_resp);
        pull_request_id = pull_request_resp["data"]["repository"]["pullRequest"]["id"];

        console.log(`Adding Pull Request ${issue} to project ${project_id}`);
        console.log("");
        query = `
        mutation($pullRequestId:ID!, $projectId:ID!) {
          updatePullRequest(input:{pullRequestId:$pullRequestId, projectIds:[$projectId]}) {
            pullRequest {
              id
            }
          }
        }`;
        variables = { pullRequestId: pull_request_id, projectId: project_id };
        response = await github_query(github_token, query, variables);
        console.log(response);
    }
    else {
      console.log('Need to set either issue or pull_request')
    }

    console.log(`Done!`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
