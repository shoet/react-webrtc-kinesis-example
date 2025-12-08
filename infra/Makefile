.DEFAULT_GOAL := help

.PHONY: deploy
deploy: ## deploy infra
	npx cdk deploy --require-approval never InfraStack

destroy: ## destroy infra
	npx cdk destroy --force InfraStack

.PHONY: help
help: ## Show options
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
    awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
