// Why: agent listings read every page, so they skip the heavy fields they never return.
const OPENKODO_PROJECT_SUMMARY_FIELDS = `
  id
  slugId
  name
  url
  color
  icon
  updatedAt
  status {
    id
    name
    type
    color
  }
  teams(first: 10) {
    nodes {
      id
      name
      key
    }
  }
`

const OPENKODO_PROJECT_EXTRA_FIELDS = `
  description
  content
  health
  priority
  priorityLabel
  progress
  scope
  issueCountHistory
  completedIssueCountHistory
  startDate
  targetDate
  createdAt
  completedAt
  canceledAt
  startedAt
  lead {
    id
    displayName
    avatarUrl
  }
  members(first: 10) {
    nodes {
      id
      displayName
      avatarUrl
    }
  }
  labels(first: 20) {
    nodes {
      id
      name
      color
    }
  }
`

export const OPENKODO_PROJECT_FIELDS = `
  ${OPENKODO_PROJECT_SUMMARY_FIELDS}
  ${OPENKODO_PROJECT_EXTRA_FIELDS}
`

const OPENKODO_PROJECT_LIST_FIELDS = `
  ${OPENKODO_PROJECT_SUMMARY_FIELDS}
  ... @include(if: $detail) {
    ${OPENKODO_PROJECT_EXTRA_FIELDS}
  }
`

export const OPENKODO_PROJECT_DETAIL_FIELDS = `
  ${OPENKODO_PROJECT_FIELDS}
  projectMilestones(first: 20) {
    nodes {
      id
      name
      status
      targetDate
      progress
    }
  }
  externalLinks(first: 20) {
    nodes {
      id
      label
      url
    }
  }
  lastUpdate {
    id
    body
    health
    url
    createdAt
    updatedAt
    user {
      id
      displayName
      avatarUrl
    }
  }
`

export const OPENKODO_ISSUE_FIELDS = `
  id
  identifier
  title
  branchName
  description
  url
  priority
  estimate
  updatedAt
  labelIds
  state {
    name
    type
    color
  }
  team {
    id
    name
    key
  }
  assignee {
    id
    displayName
    avatarUrl
  }
  labels(first: 50) {
    nodes {
      id
      name
    }
  }
`

export const PROJECTS_QUERY = `
  query OrcaLinearProjects(
    $first: Int
    $after: String
    $filter: ProjectFilter
    $orderBy: PaginationOrderBy
    $detail: Boolean = true
  ) {
    projects(first: $first, after: $after, filter: $filter, orderBy: $orderBy) {
      nodes {
        ${OPENKODO_PROJECT_LIST_FIELDS}
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

export const SEARCH_PROJECTS_QUERY = `
  query OrcaLinearProjectSearch(
    $term: String!
    $first: Int
    $after: String
    $detail: Boolean = true
  ) {
    searchProjects(term: $term, first: $first, after: $after) {
      nodes {
        ${OPENKODO_PROJECT_LIST_FIELDS}
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

export const PROJECT_QUERY = `
  query OrcaLinearProject($id: String!) {
    project(id: $id) {
      ${OPENKODO_PROJECT_DETAIL_FIELDS}
    }
  }
`

export const CREATE_PROJECT_MUTATION = `
  mutation OrcaLinearProjectCreate($input: ProjectCreateInput!) {
    projectCreate(input: $input) {
      success
      project {
        ${OPENKODO_PROJECT_DETAIL_FIELDS}
      }
    }
  }
`

export const PROJECT_ISSUES_QUERY = `
  query OrcaLinearProjectIssues(
    $id: String!,
    $first: Int,
    $after: String,
    $orderBy: PaginationOrderBy
  ) {
    project(id: $id) {
      issues(first: $first, after: $after, orderBy: $orderBy) {
        nodes {
          ${OPENKODO_ISSUE_FIELDS}
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`

export const PROJECT_TEAMS_QUERY = `
  query OrcaLinearProjectTeams($id: String!, $first: Int, $after: String) {
    project(id: $id) {
      teams(first: $first, after: $after) {
        nodes {
          id
          name
          key
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`
