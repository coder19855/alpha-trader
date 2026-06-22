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
          want_major="$(echo "${NODE_VERSION}" | cut -d. -f1)"
          have_major="$(node --version 2>/dev/null | tr -d v | cut -d. -f1 || true)"

          if [ "$have_major" != "$want_major" ] && [ -s "$HOME/.nvm/nvm.sh" ]; then
            . "$HOME/.nvm/nvm.sh"
            nvm install "${NODE_VERSION}"
            nvm use "${NODE_VERSION}"
          fi

          node --version
          npm --version
        '''
      }
    }

    stage('Install') {
      steps {
        sh 'npm ci --legacy-peer-deps'
      }
    }

    stage('Build') {
      steps {
        sh 'npm run build'
      }
    }

    stage('Test') {
      steps {
        sh 'npm test'
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
        sh 'chmod +x scripts/deploy/restart-services.sh'
        sh 'bash scripts/deploy/restart-services.sh'
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