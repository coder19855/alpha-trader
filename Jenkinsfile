pipeline {
  agent any

  options {
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 45, unit: 'MINUTES')
    timestamps()
  }

  environment {
    NODE_VERSION = '22.23.0'
    CI = 'true'
    // API listens on all interfaces; VPS maps public :20063 → :3000
    HOST = '0.0.0.0'
    PORT = '3000'
    NODE_ENV = 'production'
    // API + Angular on the same port (:3000 → public :20063)
    SERVE_WEB_APP = 'true'
    NVM_DIR = "${env.HOME}/.nvm"
  }

  triggers {
    // Fallback if a Git webhook is not configured yet (every 5 minutes).
    pollSCM('H/5 * * * *')
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Setup Node') {
      steps {
        sh '''
          set -e
          export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
          want_major="$(echo "${NODE_VERSION}" | cut -d. -f1)"

          if [ ! -s "$NVM_DIR/nvm.sh" ]; then
            echo "Node not in Jenkins container PATH — installing nvm (host Node is not visible here)..."
            if ! command -v curl >/dev/null 2>&1; then
              echo "curl is required to bootstrap nvm inside the Jenkins container"
              exit 1
            fi
            curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
          fi

          # shellcheck disable=SC1091
          . "$NVM_DIR/nvm.sh"

          have_major="$(node --version 2>/dev/null | tr -d v | cut -d. -f1 || true)"
          if [ "$have_major" != "$want_major" ]; then
            nvm install "${NODE_VERSION}"
          fi
          nvm use "${NODE_VERSION}"
          nvm alias default "${NODE_VERSION}" >/dev/null

          {
            echo "export NVM_DIR=\\"$NVM_DIR\\""
            echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use '"${NODE_VERSION}"' >/dev/null'
          } > .jenkins-node.sh

          node --version
          npm --version
        '''
      }
    }

    stage('Install') {
      steps {
        sh '''
          set -e
          . ./.jenkins-node.sh
          npm ci --legacy-peer-deps
        '''
      }
    }

    stage('Build') {
      steps {
        sh '''
          set -e
          . ./.jenkins-node.sh
          npm run build
        '''
      }
    }

    stage('Test') {
      steps {
        sh '''
          set -e
          . ./.jenkins-node.sh
          npm test
        '''
      }
    }

    stage('Deploy') {
      when {
        anyOf {
          branch 'main'
          branch 'master'
        }
      }
      steps {
        sh '''
          set -e
          # Prefer restarting the host systemd unit when Jenkins SSH deploy is configured.
          if [ -n "${DEPLOY_SSH_TARGET:-}" ]; then
            ssh -o StrictHostKeyChecking=no ${DEPLOY_SSH_OPTS:-} "${DEPLOY_SSH_TARGET}" \
              "systemctl restart alpha-trader-api && systemctl is-active alpha-trader-api"
          else
            chmod +x scripts/deploy/restart-services.sh
            bash scripts/deploy/restart-services.sh
          fi
        '''
      }
    }
  }

  post {
    success {
      echo 'Pipeline succeeded.'
    }
    failure {
      echo 'Pipeline failed — previous deployment left running if deploy stage did not start.'
    }
  }
}