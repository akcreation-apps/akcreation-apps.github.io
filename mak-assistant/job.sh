#!/bin/bash
# job.sh
echo "Job started at $(date)" >> job.log
python3 logger.py "MAK job executed successfully"
