pipeline {
    agent { 
        node { 
            label 'mmaudio' 
        } 
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        skipDefaultCheckout(false)
        timeout(time: 30, unit: 'MINUTES')
    }

    environment {
        // Ensure yarn uses local cache
        YARN_CACHE_FOLDER = "${env.WORKSPACE}/.yarn-cache"
        // Force color output for better logs
        FORCE_COLOR = '1'
        // Node environment
        NODE_ENV = 'development'
    }

    stages {
        stage('Environment Setup') {
            steps {
                echo '🔧 Setting up build environment...'
                bat 'node --version'
                bat 'npm --version'
                bat 'yarn --version'
                bat 'git --version'
                
                echo "Branch: ${env.BRANCH_NAME}"
                echo "Build: ${env.BUILD_NUMBER}"
                echo "Workspace: ${env.WORKSPACE}"

                script {
                    if (env.CHANGE_ID) {
                        echo "🔀 Pull Request Build: PR-${env.CHANGE_ID}"
                        echo "📝 PR Title: ${env.CHANGE_TITLE}"
                        echo "🎯 Target: ${env.CHANGE_TARGET}"
                    } else {
                        echo "🌿 Branch Build: ${env.BRANCH_NAME}"
                    }
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                echo '📦 Installing dependencies...'
                bat 'yarn install'
            }
        }

        stage('Lint') {
            steps {
                echo '🔍 Running linting checks...'
                bat 'yarn lint'
            }
            post {
                failure {
                    echo '❌ Linting failed! Please fix code style issues.'
                }
            }
        }

        stage('Format Check') {
            steps {
                echo '🎨 Checking code formatting...'
                bat 'yarn format:check'
            }
            post {
                failure {
                    echo '❌ Code formatting check failed! Please run "yarn format" to fix formatting issues.'
                }
            }
        }
        
        stage('Type Check') {
            steps {
                echo '🔎 Running TypeScript type checking...'
                bat 'yarn turbo run typecheck'
            }
            post {
                failure {
                    echo '❌ Type checking failed! Please fix TypeScript errors.'
                }
            }
        }

        stage('Build') {
            steps {
                echo '🏗️ Building all packages...'
                bat 'yarn turbo run build'

                // Verify build outputs
                echo '📋 Checking build outputs...'
                bat 'dir packages\\api\\dist'
                bat 'dir packages\\core\\dist'
            }
            post {
                failure {
                    echo '❌ Build failed! Please check build errors.'
                }
            }
        }        
        
        stage('Test') {
            steps {
                echo '🧪 Running tests...'
                script {
                    try {
                        bat 'yarn turbo run test:workspace'
                        echo "✅ Tests completed successfully"
                    } catch (Exception e) {
                        echo '⚠️ No tests configured or tests failed'
                        echo "Test error: ${e.getMessage()}"
                        // Don't fail the build if tests aren't set up yet
                        currentBuild.result = 'UNSTABLE'
                    }
                }
            }
            post {
                always {
                    script {
                        if (fileExists('packages/api/test-results/merged-results.xml') || 
                            fileExists('packages/core/test-results/merged-results.xml')) {
                            junit testResults: 'packages/{api,core}/test-results/merged-results.xml', allowEmptyResults: true
                        }
                        else {
                            echo "⚠️ No test result XML files found"
                            currentBuild.result = 'UNSTABLE'
                        }
                        // Archive test artifacts
                        archiveArtifacts artifacts: '**/test-results/*.xml', allowEmptyArchive: true
                    }
                }
                failure {
                    echo '❌ Tests failed! Check test results for details.'
                }
                unstable {
                    echo '⚠️ Some tests failed but build continues.'
                }
            }
        }

        stage('Generate Coverage Report') {
            steps {
                echo '📊 Generating Coverage report...'
                script {
                    try {
                        bat 'yarn turbo run coverage:workspace'
                        echo "✅ Generated coverage successfully"
                    } catch (Exception e) {
                        echo "Coverage error: ${e.getMessage()}"
                        // Don't fail the build if coverage generation fails
                        currentBuild.result = 'UNSTABLE'
                    }
                }
            }
            post {
                always {
                    script {
                        // Check specific expected files
                        def coverageReport = fileExists('coverage/merged/index.html')
                        
                        echo "=== COVERAGE REPORT CHECK ==="
                        echo coverageReport ? "✅ Coverage report found" : "❌ Coverage report missing"
                        
                        // Archive coverage artifacts
                        archiveArtifacts artifacts: 'coverage/merged/index.html', allowEmptyArchive: true
                    }
                }
                failure {
                    echo '❌ Coverage generation failed! Check coverage configuration.'
                }
                unstable {
                    echo '⚠️ Coverage generation completed with warnings.'
                }
            }
        }
    }

    post {
        always {
            echo '🧹 Cleaning up...'
            // Clean up node_modules cache if needed
            // bat 'yarn cache clean'
        }
        success {
            echo '✅ Pipeline completed successfully!'
            script {
                if (env.CHANGE_ID) {
                    echo "🎉 PR-${env.CHANGE_ID} is ready for review!"
                } else {
                    echo "🚀 Branch ${env.BRANCH_NAME} built successfully!"
                }
            }
        }
        failure {
            echo '❌ Pipeline failed!'
            script {
                if (env.CHANGE_ID) {
                    echo "🚨 PR-${env.CHANGE_ID} has build failures that need to be fixed."
                } else {
                    echo "🚨 Branch ${env.BRANCH_NAME} build failed."
                }
            }
        }
        unstable {
            echo '⚠️ Pipeline completed with warnings (tests may have failed).'
        }
    }
}
